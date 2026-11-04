import { sql } from '../core/db'
import { errorMessage, TransientError } from '../core/errors'
import { getFlags } from '../core/settings'
import { auditLog } from '../core/audit'
import { getEmailProvider, type EmailProvider } from './providers'
import { isSuppressed } from './suppression'
import { unsubscribeUrl } from './compose'

interface MsgRow {
  id: string
  campaign_id: string | null
  campaign_prospect_id: string | null
  business_id: string | null
  to_email: string
  from_email: string
  from_name: string | null
  reply_to: string | null
  subject: string
  body_text: string
  message_id_header: string
  in_reply_to: string | null
  references_header: string | null
  unsubscribe_token: string
  idempotency_key: string
  attempts: number
  is_test: boolean
}

export type SendOutcome = 'SENT' | 'SKIPPED' | 'RETRY' | 'FAILED'

/**
 * Send one SCHEDULED message. The SCHEDULED→SENDING transition is an atomic UPDATE, so two workers
 * (or a retry) can never send the same row twice; the provider also receives an idempotency key.
 */
export async function sendOutbound(messageId: string, provider?: EmailProvider): Promise<{ outcome: SendOutcome; reason?: string }> {
  const db = sql()
  const [m] = await db<MsgRow[]>`
    update outbound_messages set status = 'SENDING', attempts = attempts + 1
    where id = ${messageId} and status = 'SCHEDULED' and (scheduled_at is null or scheduled_at <= now())
    returning id, campaign_id, campaign_prospect_id, business_id, to_email, from_email, from_name, reply_to, subject, body_text,
              message_id_header, in_reply_to, references_header, unsubscribe_token, idempotency_key, attempts, is_test`
  if (!m) return { outcome: 'SKIPPED', reason: 'déjà traité ou non planifié' }
  const cancel = async (reason: string) => {
    await db`update outbound_messages set status = 'CANCELLED', last_error = ${reason} where id = ${m.id}`
    return { outcome: 'SKIPPED' as const, reason }
  }
  const flags = await getFlags()
  if (flags.emergencyStop && !m.is_test) {
    await db`update outbound_messages set status = 'SCHEDULED', attempts = attempts - 1 where id = ${m.id}`
    return { outcome: 'SKIPPED', reason: 'arrêt d’urgence actif' }
  }
  if (await isSuppressed(m.to_email)) return cancel('destinataire dans la liste de suppression')
  if (m.business_id) {
    const [b] = await db<{ do_not_contact: boolean; pipeline_status: string }[]>`select do_not_contact, pipeline_status from businesses where id = ${m.business_id}`
    if (b?.do_not_contact || b?.pipeline_status === 'DO_NOT_CONTACT') return cancel('prospect marqué « ne pas contacter »')
  }
  if (m.campaign_prospect_id) {
    const [cp] = await db<{ status: string; campaign_status: string }[]>`
      select cp.status, c.status as campaign_status from campaign_prospects cp join campaigns c on c.id = cp.campaign_id where cp.id = ${m.campaign_prospect_id}`
    if (cp && !['ACTIVE', 'APPROVED'].includes(cp.status)) return cancel(`séquence arrêtée (${cp.status})`)
    if (cp && cp.campaign_status !== 'ACTIVE') {
      await db`update outbound_messages set status = 'SCHEDULED', attempts = attempts - 1 where id = ${m.id}`
      return { outcome: 'SKIPPED', reason: 'campagne non active' }
    }
  }
  try {
    const p = provider ?? (await getEmailProvider())
    const r = await p.send({
      from: m.from_email,
      fromName: m.from_name,
      to: m.to_email,
      replyTo: m.reply_to,
      subject: m.subject,
      text: m.body_text,
      messageId: m.message_id_header,
      idempotencyKey: m.idempotency_key,
      headers: {
        'List-Unsubscribe': `<${await unsubscribeUrl(m.unsubscribe_token)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-PF-Message': m.id,
        ...(m.in_reply_to ? { 'In-Reply-To': m.in_reply_to, References: m.references_header ?? m.in_reply_to } : {}),
      },
    })
    await db`update outbound_messages set status = 'SENT', sent_at = now(), provider = ${r.provider}, provider_message_id = ${r.providerMessageId}, last_error = null where id = ${m.id}`
    await db`insert into email_events (outbound_message_id, provider, provider_event_id, type, payload) values (${m.id}, ${r.provider}, ${'local-sent-' + m.id}, 'sent', '{}'::jsonb) on conflict do nothing`
    if (m.business_id && !m.is_test)
      await db`update businesses set pipeline_status = 'CONTACTED' where id = ${m.business_id} and pipeline_status in ('NEW','DISCOVERED','ENRICHED','QUALIFIED','WEBSITE_GENERATED')`
    if (m.campaign_prospect_id) await advanceSequence(m.campaign_prospect_id)
    return { outcome: 'SENT' }
  } catch (e) {
    const msg = errorMessage(e).slice(0, 1000)
    if (e instanceof TransientError && m.attempts < 4) {
      await db`update outbound_messages set status = 'SCHEDULED', last_error = ${msg}, scheduled_at = now() + ${Math.min(3600, 60 * 4 ** (m.attempts - 1)) + ' seconds'}::interval where id = ${m.id}`
      return { outcome: 'RETRY', reason: msg }
    }
    await db`update outbound_messages set status = 'FAILED', last_error = ${msg} where id = ${m.id}`
    await auditLog({ action: 'email.failed', level: 'error', entityType: 'business', entityId: m.business_id, data: { messageId: m.id, error: msg } })
    return { outcome: 'FAILED', reason: msg }
  }
}

/** After a successful send: move the enrolment to the next step (or complete it). */
export async function advanceSequence(campaignProspectId: string) {
  const db = sql()
  const [cp] = await db<{ campaign_id: string; current_step: number }[]>`select campaign_id, current_step from campaign_prospects where id = ${campaignProspectId}`
  if (!cp) return
  const [next] = await db<{ delay_days: number }[]>`select delay_days from campaign_sequences where campaign_id = ${cp.campaign_id} and step = ${cp.current_step + 1}`
  if (next)
    await db`update campaign_prospects set current_step = current_step + 1, status = 'ACTIVE', next_send_at = now() + ${next.delay_days + ' days'}::interval where id = ${campaignProspectId} and status in ('ACTIVE','APPROVED')`
  else await db`update campaign_prospects set status = 'COMPLETED', next_send_at = null where id = ${campaignProspectId} and status in ('ACTIVE','APPROVED')`
}

/** Messages stuck in SENDING (worker crash between provider call and DB update) are NOT resent automatically. */
export async function flagStuckSending(): Promise<number> {
  const rows = await sql()`update outbound_messages set status = 'FAILED',
      last_error = 'État incertain après interruption du worker : vérifiez dans le fournisseur avant de renvoyer.'
    where status = 'SENDING' and updated_at < now() - interval '15 minutes' returning id`
  return rows.length
}
