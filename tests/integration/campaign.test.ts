import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql, closeDb } from '@/server/core/db'
import { updateSettings, setFlags } from '@/server/core/settings'
import { addProspects, createCampaign, setCampaignStatus, tickCampaign, prepareDueMessages, approveMessage } from '@/server/campaigns/service'
import { sendOutbound } from '@/server/email/send'
import { processInbound } from '@/server/email/inbound'
import { suppress, isSuppressed } from '@/server/email/suppression'
import { processResendEvent } from '@/server/email/events'
import type { EmailProvider } from '@/server/email/providers'
import { insertTestBusiness, resetDb } from './helpers'

beforeEach(async () => {
  await resetDb()
  await updateSettings({ outreach: { senderName: 'TEST Sender', senderEmail: 'sender@example.test', signature: 'TEST' } })
})
afterAll(closeDb)

const allDays = { sendDays: [1, 2, 3, 4, 5, 6, 7], sendStartMinute: 0, sendEndMinute: 1440 }

async function activeCampaign(mode: 'MANUAL' | 'SEMI_AUTO' | 'AUTO' = 'SEMI_AUTO', extra: Record<string, unknown> = {}) {
  const id = await createCampaign({ name: 'TEST campagne', mode, minIntervalSeconds: 10, ...allDays, ...extra })
  return id
}

describe('campaign engine', () => {
  it('sends J0 via the provider, records the provider id, schedules J+3, never double-sends', async () => {
    const b = await insertTestBusiness()
    const c = await activeCampaign('MANUAL')
    expect((await addProspects(c, [b])).added).toBe(1)
    await setCampaignStatus(c, 'ACTIVE')
    // MANUAL: message waits for approval
    expect((await tickCampaign(c, new Date())).sent).toBe(0)
    const [m] = await sql()<{ id: string; status: string; body_text: string }[]>`select id, status, body_text from outbound_messages where campaign_id = ${c}`
    expect(m!.status).toBe('AWAITING_APPROVAL')
    expect(m!.body_text).toMatch(/\/u\/[A-Za-z0-9_-]+/) // unsubscribe link
    await approveMessage(m!.id)
    const r = await tickCampaign(c, new Date())
    expect(r.sent).toBe(1)
    const [sent] = await sql()<{ status: string; provider: string; provider_message_id: string; message_id_header: string }[]>`select status, provider, provider_message_id, message_id_header from outbound_messages where id = ${m!.id}`
    expect(sent).toMatchObject({ status: 'SENT', provider: 'sandbox' })
    expect(sent!.provider_message_id).toMatch(/^sandbox_/)
    // second send attempt on the same row is a no-op
    expect((await sendOutbound(m!.id)).outcome).toBe('SKIPPED')
    // re-preparing does not create a duplicate for the same step
    await prepareDueMessages(c)
    const [{ n }] = (await sql()<{ n: number }[]>`select count(*)::int n from outbound_messages where campaign_id = ${c}`) as unknown as [{ n: number }]
    expect(n).toBe(1)
    const [cp] = await sql()<{ current_step: number; next_send_at: Date }[]>`select current_step, next_send_at from campaign_prospects where campaign_id = ${c}`
    expect(cp!.current_step).toBe(1)
    expect(cp!.next_send_at.getTime() - Date.now()).toBeGreaterThan(2.9 * 86400_000)
    const [biz] = await sql()<{ pipeline_status: string }[]>`select pipeline_status from businesses where id = ${b}`
    expect(biz!.pipeline_status).toBe('CONTACTED')
  })

  it('respects the daily cap and the send window', async () => {
    const ids = [await insertTestBusiness({ email: 'a@example.test' }), await insertTestBusiness({ name: 'TEST B', email: 'b@example.test', phone: '+33235000001' })]
    const c = await createCampaign({ name: 'TEST cap', mode: 'AUTO', dailyLimit: 1, minIntervalSeconds: 10, ...allDays })
    await addProspects(c, ids)
    await setCampaignStatus(c, 'ACTIVE')
    expect((await tickCampaign(c)).sent).toBe(1)
    await sql()`update outbound_messages set sent_at = sent_at - interval '1 hour'` // bypass the min interval
    const r = await tickCampaign(c)
    expect(r.sent).toBe(0)
    expect(r.reason).toMatch(/plafond/)
    const w = await createCampaign({ name: 'TEST window', sendDays: [1], sendStartMinute: 600, sendEndMinute: 601 })
    await addProspects(w, [await insertTestBusiness({ name: 'TEST C', email: 'c@example.test', phone: '+33235000002' })])
    await setCampaignStatus(w, 'ACTIVE')
    expect((await tickCampaign(w, new Date('2026-11-03T15:00:00Z'))).reason).toMatch(/hors plage/)
  })

  it('a reply stops the sequence, cancels pending follow-ups and updates the CRM', async () => {
    const b = await insertTestBusiness()
    const c = await activeCampaign('AUTO')
    await addProspects(c, [b])
    await setCampaignStatus(c, 'ACTIVE')
    await tickCampaign(c)
    const [first] = await sql()<{ message_id_header: string }[]>`select message_id_header from outbound_messages where campaign_id = ${c}`
    // make step 2 due and prepared (not yet sent)
    await sql()`update campaign_prospects set next_send_at = now() - interval '1 minute'`
    await prepareDueMessages(c)
    expect((await sql()`select 1 from outbound_messages where campaign_id = ${c} and status = 'SCHEDULED'`).length).toBe(1)
    const r = await processInbound({ from: 'TEST <test-prospect@example.test>', subject: 'Re: proposition', text: 'Bonjour, ça m’intéresse, pouvez-vous me rappeler mardi ?', messageId: '<reply-1@example.test>', inReplyTo: first!.message_id_header, source: 'webhook' })
    expect(r.businessId).toBe(b)
    expect(['MEETING_REQUEST', 'INTERESTED']).toContain(r.classification)
    const [cp] = await sql()<{ status: string }[]>`select status from campaign_prospects where campaign_id = ${c}`
    expect(cp!.status).toBe('REPLIED')
    expect((await sql()`select 1 from outbound_messages where campaign_id = ${c} and status = 'SCHEDULED'`).length).toBe(0)
    const [biz] = await sql()<{ pipeline_status: string }[]>`select pipeline_status from businesses where id = ${b}`
    expect(biz!.pipeline_status).toBe('INTERESTED')
    expect((await sql()`select 1 from crm_tasks where business_id = ${b}`).length).toBe(1)
    // idempotent on Message-ID
    expect((await processInbound({ from: 'test-prospect@example.test', text: 'x', messageId: '<reply-1@example.test>', source: 'webhook' })).duplicate).toBe(true)
  })

  it('out-of-office replies do NOT stop the sequence', async () => {
    const b = await insertTestBusiness()
    const c = await activeCampaign('AUTO')
    await addProspects(c, [b])
    await setCampaignStatus(c, 'ACTIVE')
    await tickCampaign(c)
    await processInbound({ from: 'test-prospect@example.test', subject: 'Réponse automatique : absence', text: 'Je suis en congés', headers: { 'Auto-Submitted': 'auto-replied' }, source: 'webhook' })
    const [cp] = await sql()<{ status: string }[]>`select status from campaign_prospects where campaign_id = ${c}`
    expect(cp!.status).toBe('ACTIVE')
  })

  it('unsubscribe → global suppression, sequences stopped, future sends refused', async () => {
    const b = await insertTestBusiness()
    const c = await activeCampaign('AUTO')
    await addProspects(c, [b])
    await setCampaignStatus(c, 'ACTIVE')
    await prepareDueMessages(c)
    await processInbound({ from: 'test-prospect@example.test', subject: 'Re', text: 'Merci de ne plus me contacter.', source: 'webhook' })
    expect(await isSuppressed('TEST-PROSPECT@example.test')).toBe(true)
    const [m] = await sql()<{ status: string }[]>`select status from outbound_messages where campaign_id = ${c}`
    expect(m!.status).toBe('CANCELLED')
    const [biz] = await sql()<{ do_not_contact: boolean }[]>`select do_not_contact from businesses where id = ${b}`
    expect(biz!.do_not_contact).toBe(true)
    // cannot be re-enrolled
    const c2 = await activeCampaign('AUTO', { name: 'TEST 2' })
    expect((await addProspects(c2, [b])).added).toBe(0)
  })

  it('emergency stop blocks sending; a suppressed recipient is cancelled at send time', async () => {
    const b = await insertTestBusiness()
    const c = await activeCampaign('AUTO')
    await addProspects(c, [b])
    await setCampaignStatus(c, 'ACTIVE')
    await setFlags({ emergencyStop: true })
    expect((await tickCampaign(c)).sent).toBe(0)
    await setFlags({ emergencyStop: false })
    await prepareDueMessages(c)
    await suppress({ email: 'test-prospect@example.test', reason: 'MANUAL', source: 'test' })
    const [m] = await sql()<{ id: string; status: string }[]>`select id, status from outbound_messages where campaign_id = ${c}`
    expect(m!.status).toBe('CANCELLED')
  })

  it('transient provider errors are retried, permanent ones fail and are logged', async () => {
    const b = await insertTestBusiness()
    const c = await activeCampaign('AUTO')
    await addProspects(c, [b])
    await setCampaignStatus(c, 'ACTIVE')
    await prepareDueMessages(c)
    const [m] = await sql()<{ id: string }[]>`select id from outbound_messages where campaign_id = ${c}`
    const { TransientError } = await import('@/server/core/errors')
    const flaky: EmailProvider = { id: 'smtp', send: async () => { throw new TransientError('421 try later') } }
    expect((await sendOutbound(m!.id, flaky)).outcome).toBe('RETRY')
    await sql()`update outbound_messages set scheduled_at = now() where id = ${m!.id}`
    const broken: EmailProvider = { id: 'smtp', send: async () => { throw new Error('550 rejected') } }
    expect((await sendOutbound(m!.id, broken)).outcome).toBe('FAILED')
    const [row] = await sql()<{ status: string; attempts: number; last_error: string }[]>`select status, attempts, last_error from outbound_messages where id = ${m!.id}`
    expect(row).toMatchObject({ status: 'FAILED', attempts: 2 })
    expect(row!.last_error).toMatch(/550/)
  })

  it('provider bounce events suppress the address and invalidate the contact', async () => {
    const b = await insertTestBusiness()
    const c = await activeCampaign('AUTO')
    await addProspects(c, [b])
    await setCampaignStatus(c, 'ACTIVE')
    await prepareDueMessages(c)
    await sql()`update outbound_messages set status = 'SENT', provider = 'resend', provider_message_id = 're_123', sent_at = now()`
    expect((await processResendEvent('evt_1', { type: 'email.bounced', data: { email_id: 're_123', bounce: { type: 'Permanent' } } })).applied).toBe(true)
    expect((await processResendEvent('evt_1', { type: 'email.bounced', data: { email_id: 're_123' } })).applied).toBe(false)
    expect(await isSuppressed('test-prospect@example.test')).toBe(true)
    const [ct] = await sql()<{ status: string }[]>`select status from business_contacts where business_id = ${b} and kind = 'email'`
    expect(ct!.status).toBe('INVALID')
  })
})
