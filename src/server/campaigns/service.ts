import { z } from 'zod'
import { sql } from '../core/db'
import { randomToken } from '../core/crypto'
import { auditLog } from '../core/audit'
import { AppError } from '../core/errors'
import { getFlags, getSettings } from '../core/settings'
import { messageIdFor, renderTemplate, withComplianceFooter } from '../email/compose'
import { isSuppressed } from '../email/suppression'
import { sendOutbound } from '../email/send'
import { EMAIL_VARIANTS, type ProposalContent } from '../proposals/content'
import { generateProposal, previewUrl } from '../proposals/service'
import { isInWindow, localParts } from './window'

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(''),
  mode: z.enum(['MANUAL', 'SEMI_AUTO', 'AUTO']).default('MANUAL'),
  fromName: z.string().max(120).optional().nullable(),
  fromEmail: z.string().email().optional().nullable(),
  replyTo: z.string().email().optional().nullable(),
  offerId: z.string().uuid().optional().nullable(),
  strategyId: z.string().uuid().optional().nullable(),
  timezone: z.string().default('Europe/Paris'),
  sendDays: z.array(z.number().int().min(1).max(7)).min(1).default([1, 2, 3, 4, 5]),
  sendStartMinute: z.number().int().min(0).max(1439).default(540),
  sendEndMinute: z.number().int().min(1).max(1440).default(1080),
  dailyLimit: z.number().int().min(1).max(2000).default(20),
  minIntervalSeconds: z.number().int().min(10).max(3600).default(120),
  steps: z
    .array(z.object({ delayDays: z.number().int().min(0).max(60), contentKey: z.enum(EMAIL_VARIANTS), subjectTemplate: z.string().max(200).optional().nullable(), bodyTemplate: z.string().max(10000).optional().nullable() }))
    .min(1)
    .max(6)
    .default([{ delayDays: 0, contentKey: 'initial' }, { delayDays: 3, contentKey: 'followup1' }, { delayDays: 4, contentKey: 'followup2' }]),
  autoFilters: z.object({ savedSearchId: z.string().uuid().optional().nullable(), minScore: z.number().int().min(0).max(100).default(60), requireEmail: z.boolean().default(true), maxPerRun: z.number().int().min(1).max(200).default(20) }).optional().nullable(),
  autoGenerateSite: z.boolean().default(false),
}).refine((c) => c.sendEndMinute > c.sendStartMinute, { message: 'La fin de la plage horaire doit suivre son début' })
export type CampaignInput = z.infer<typeof campaignInputSchema>

export async function createCampaign(input: unknown): Promise<string> {
  const c = campaignInputSchema.parse(input)
  const s = await getSettings()
  const db = sql()
  return db.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`insert into campaigns (name, description, mode, from_name, from_email, reply_to, offer_id, strategy_id, timezone, send_days,
        send_start_minute, send_end_minute, daily_limit, min_interval_seconds, auto_filters, auto_generate_site)
      values (${c.name}, ${c.description}, ${c.mode}, ${c.fromName || s.outreach.senderName || null}, ${c.fromEmail || s.outreach.senderEmail || null}, ${c.replyTo || s.outreach.replyTo || null},
        ${c.offerId ?? null}, ${c.strategyId ?? null}, ${c.timezone}, ${c.sendDays}, ${c.sendStartMinute}, ${c.sendEndMinute}, ${c.dailyLimit}, ${c.minIntervalSeconds},
        ${c.autoFilters ? tx.json(c.autoFilters as never) : null}, ${c.autoGenerateSite})
      returning id`
    let i = 0
    for (const st of c.steps) {
      await tx`insert into campaign_sequences (campaign_id, step, delay_days, content_key, subject_template, body_template)
               values (${row!.id}, ${i++}, ${st.delayDays}, ${st.contentKey}, ${st.subjectTemplate ?? null}, ${st.bodyTemplate ?? null})`
    }
    return row!.id
  })
}

/** Enrol prospects. Contacts are chosen among non-opted-out, non-invalid professional emails. */
export async function addProspects(campaignId: string, businessIds: string[]): Promise<{ added: number; skipped: { businessId: string; reason: string }[] }> {
  const db = sql()
  const [camp] = await db<{ mode: string; status: string }[]>`select mode, status from campaigns where id = ${campaignId}`
  if (!camp) throw new AppError('Campagne introuvable', 404, 'NOT_FOUND')
  const skipped: { businessId: string; reason: string }[] = []
  let added = 0
  for (const id of businessIds.slice(0, 2000)) {
    const [b] = await db<{ id: string; email: string | null; email_status: string; do_not_contact: boolean; pipeline_status: string }[]>`
      select id, email, email_status, do_not_contact, pipeline_status from businesses where id = ${id} and merged_into is null`
    if (!b) { skipped.push({ businessId: id, reason: 'introuvable' }); continue }
    if (b.do_not_contact || b.pipeline_status === 'DO_NOT_CONTACT') { skipped.push({ businessId: id, reason: 'ne pas contacter' }); continue }
    if (!b.email || b.email_status === 'INVALID') { skipped.push({ businessId: id, reason: 'aucun email exploitable' }); continue }
    if (await isSuppressed(b.email)) { skipped.push({ businessId: id, reason: 'liste de suppression' }); continue }
    const [site] = await db<{ id: string }[]>`select id from generated_websites where business_id = ${id} and status = 'READY' and preview_enabled order by created_at desc limit 1`
    const status = camp.mode === 'SEMI_AUTO' ? 'PENDING' : 'APPROVED'
    const r = await db`insert into campaign_prospects (campaign_id, business_id, contact_email, website_id, status)
      values (${campaignId}, ${id}, ${b.email}, ${site?.id ?? null}, ${status}) on conflict (campaign_id, business_id) do nothing returning id`
    if (r.length) added++
    else skipped.push({ businessId: id, reason: 'déjà dans la campagne' })
  }
  await auditLog({ action: 'campaign.add_prospects', entityType: 'campaign', entityId: campaignId, data: { added, skipped: skipped.length } })
  return { added, skipped }
}

export async function setCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED' | 'STOPPED', reason?: string) {
  const db = sql()
  const [c] = await db<{ status: string }[]>`select status from campaigns where id = ${campaignId}`
  if (!c) throw new AppError('Campagne introuvable', 404, 'NOT_FOUND')
  if (c.status === 'STOPPED') throw new AppError('Une campagne arrêtée ne peut pas être relancée', 409, 'CONFLICT')
  if (status === 'ACTIVE') {
    const [{ n } = { n: 0 }] = await db<{ n: number }[]>`select count(*)::int n from campaign_sequences where campaign_id = ${campaignId}`
    if (!n) throw new AppError('La campagne n’a pas de séquence', 400)
    // approved enrolments start now
    await db`update campaign_prospects set status = 'ACTIVE', next_send_at = coalesce(next_send_at, now()) where campaign_id = ${campaignId} and status = 'APPROVED'`
  }
  await db`update campaigns set status = ${status}, stop_reason = ${reason ?? null} where id = ${campaignId}`
  if (status === 'STOPPED') {
    await db`update campaign_prospects set status = 'STOPPED', stop_reason = 'campagne arrêtée', next_send_at = null where campaign_id = ${campaignId} and status in ('PENDING','APPROVED','ACTIVE')`
    await db`update outbound_messages set status = 'CANCELLED', last_error = 'campagne arrêtée' where campaign_id = ${campaignId} and status in ('DRAFT','AWAITING_APPROVAL','SCHEDULED')`
  }
  await auditLog({ action: `campaign.${status.toLowerCase()}`, entityType: 'campaign', entityId: campaignId, data: { reason } })
}

export async function approveProspects(campaignId: string, ids: string[]) {
  const [c] = await sql()<{ status: string }[]>`select status from campaigns where id = ${campaignId}`
  const next = c?.status === 'ACTIVE' ? 'ACTIVE' : 'APPROVED'
  await sql()`update campaign_prospects set status = ${next}, next_send_at = case when ${next} = 'ACTIVE' then now() else null end
              where campaign_id = ${campaignId} and id in ${sql()(ids)} and status = 'PENDING'`
}

interface DueRow {
  id: string
  business_id: string
  contact_email: string
  current_step: number
  proposal_id: string | null
  website_id: string | null
}

/**
 * Materialise the message for every enrolment whose next step is due. Idempotent: the unique
 * (campaign_prospect_id, step) index and idempotency key prevent duplicates even if run twice.
 */
export async function prepareDueMessages(campaignId: string, now = new Date()): Promise<number> {
  const db = sql()
  const [c] = await db<{ id: string; mode: string; from_email: string | null; from_name: string | null; reply_to: string | null; offer_id: string | null; strategy_id: string | null }[]>`
    select id, mode, from_email, from_name, reply_to, offer_id, strategy_id from campaigns where id = ${campaignId} and status = 'ACTIVE'`
  if (!c) return 0
  if (!c.from_email) throw new AppError('Compte expéditeur non configuré (campagne ou Paramètres → Prospection)', 412, 'NOT_CONFIGURED')
  const settings = await getSettings()
  const due = await db<DueRow[]>`select id, business_id, contact_email, current_step, proposal_id, website_id from campaign_prospects
    where campaign_id = ${campaignId} and status = 'ACTIVE' and next_send_at <= ${now} order by next_send_at limit 100`
  let created = 0
  for (const cp of due) {
    const [exists] = await db`select 1 from outbound_messages where campaign_prospect_id = ${cp.id} and step = ${cp.current_step} and status <> 'CANCELLED'`
    if (exists) continue
    const [seq] = await db<{ content_key: string; subject_template: string | null; body_template: string | null }[]>`
      select content_key, subject_template, body_template from campaign_sequences where campaign_id = ${campaignId} and step = ${cp.current_step}`
    if (!seq) {
      await db`update campaign_prospects set status = 'COMPLETED', next_send_at = null where id = ${cp.id}`
      continue
    }
    let proposalId = cp.proposal_id
    if (!proposalId) {
      const p = await generateProposal({ businessId: cp.business_id, websiteId: cp.website_id, offerId: c.offer_id, strategyId: c.strategy_id })
      proposalId = p.proposalId
      await db`update campaign_prospects set proposal_id = ${proposalId} where id = ${cp.id}`
    }
    const [prop] = await db<{ content: ProposalContent }[]>`select content from proposals where id = ${proposalId}`
    const variant = prop!.content[seq.content_key as keyof ProposalContent] as { subject: string; body: string }
    const [b] = await db<{ name: string; city: string | null }[]>`select name, city from businesses where id = ${cp.business_id}`
    const [site] = cp.website_id ? await db<{ preview_token: string }[]>`select preview_token from generated_websites where id = ${cp.website_id}` : []
    const vars = { nom: b?.name, ville: b?.city, lien_demo: site ? previewUrl(site.preview_token, settings.sites.previewBaseUrl) : '', signature: settings.outreach.signature }
    const subject = seq.subject_template ? renderTemplate(seq.subject_template, vars) : variant.subject
    const body = seq.body_template ? renderTemplate(seq.body_template, vars) : variant.body
    const unsub = randomToken(18)
    const [msg] = await db<{ id: string }[]>`insert into outbound_messages (campaign_id, campaign_prospect_id, business_id, step, to_email, from_email, from_name, reply_to,
        subject, body_text, status, requires_approval, scheduled_at, unsubscribe_token, idempotency_key)
      values (${campaignId}, ${cp.id}, ${cp.business_id}, ${cp.current_step}, ${cp.contact_email}, ${c.from_email}, ${c.from_name}, ${c.reply_to},
        ${subject}, ${await withComplianceFooter(body, unsub)}, ${c.mode === 'MANUAL' ? 'AWAITING_APPROVAL' : 'SCHEDULED'}, ${c.mode === 'MANUAL'}, ${now}, ${unsub},
        ${`cp:${cp.id}:step:${cp.current_step}`})
      on conflict do nothing returning id`
    if (msg) {
      await db`update outbound_messages set message_id_header = ${messageIdFor(msg.id, c.from_email)} where id = ${msg.id}`
      created++
    }
  }
  return created
}

export async function sentTodayCount(campaignId: string, timezone: string, now = new Date()): Promise<number> {
  const { ymd } = localParts(now, timezone)
  const [r] = await sql()<{ n: number }[]>`select count(*)::int n from outbound_messages where campaign_id = ${campaignId} and status in ('SENT','DELIVERED','BOUNCED','COMPLAINED','SENDING')
    and (sent_at at time zone ${timezone})::date = ${ymd}::date`
  return r?.n ?? 0
}

/**
 * One scheduler tick for one campaign: prepare due messages, then send at most what the daily
 * quota, the send window and the minimal interval allow. Returns the number of messages sent.
 */
export async function tickCampaign(campaignId: string, now = new Date()): Promise<{ prepared: number; sent: number; reason?: string }> {
  const db = sql()
  const flags = await getFlags()
  if (flags.emergencyStop) return { prepared: 0, sent: 0, reason: 'arrêt d’urgence' }
  const [c] = await db<{ status: string; timezone: string; send_days: number[]; send_start_minute: number; send_end_minute: number; daily_limit: number; min_interval_seconds: number }[]>`
    select status, timezone, send_days, send_start_minute, send_end_minute, daily_limit, min_interval_seconds from campaigns where id = ${campaignId}`
  if (!c || c.status !== 'ACTIVE') return { prepared: 0, sent: 0, reason: 'campagne inactive' }
  const prepared = await prepareDueMessages(campaignId, now)
  if (!isInWindow(now, { timezone: c.timezone, sendDays: c.send_days, startMinute: c.send_start_minute, endMinute: c.send_end_minute })) return { prepared, sent: 0, reason: 'hors plage d’envoi' }
  const quota = c.daily_limit - (await sentTodayCount(campaignId, c.timezone, now))
  if (quota <= 0) return { prepared, sent: 0, reason: 'plafond journalier atteint' }
  const [last] = await db<{ sent_at: Date }[]>`select sent_at from outbound_messages where campaign_id = ${campaignId} and sent_at is not null order by sent_at desc limit 1`
  if (last && now.getTime() - last.sent_at.getTime() < c.min_interval_seconds * 1000) return { prepared, sent: 0, reason: 'intervalle minimal' }
  // one message per tick per campaign keeps the pace regular (tick = 1 min, interval ≥ min_interval)
  const [next] = await db<{ id: string }[]>`select id from outbound_messages where campaign_id = ${campaignId} and status = 'SCHEDULED' and scheduled_at <= ${now} order by scheduled_at, created_at limit 1`
  if (!next) return { prepared, sent: 0 }
  const r = await sendOutbound(next.id)
  // persistent provider failures pause the campaign
  if (r.outcome === 'FAILED') {
    const [{ n } = { n: 0 }] = await db<{ n: number }[]>`select count(*)::int n from (select status from outbound_messages where campaign_id = ${campaignId} and attempts > 0 order by updated_at desc limit 5) t where status = 'FAILED'`
    if (n >= 3) await setCampaignStatus(campaignId, 'PAUSED', 'Pause automatique : 3 échecs d’envoi consécutifs')
  }
  return { prepared, sent: r.outcome === 'SENT' ? 1 : 0, reason: r.reason }
}

export async function approveMessage(messageId: string, edits?: { subject?: string; body?: string }) {
  const db = sql()
  const [m] = await db<{ status: string }[]>`select status from outbound_messages where id = ${messageId}`
  if (!m || !['AWAITING_APPROVAL', 'DRAFT'].includes(m.status)) throw new AppError('Message non approuvable dans son état actuel', 409, 'CONFLICT')
  await db`update outbound_messages set status = 'SCHEDULED', scheduled_at = greatest(coalesce(scheduled_at, now()), now()),
           subject = coalesce(${edits?.subject ?? null}, subject), body_text = coalesce(${edits?.body ?? null}, body_text) where id = ${messageId}`
}
