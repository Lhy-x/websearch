import { sql } from '../core/db'
import { auditLog } from '../core/audit'
import { normalizeEmail } from '../core/normalize'
import { aiAvailability, generateStructured } from '../ai/client'
import { classifyByKeywords, classifyByRules, REPLY_SYSTEM_PROMPT, aiReplyAnalysisSchema, stripQuoted, type Classification } from './classify'
import { suppress } from './suppression'

export interface InboundEmail {
  from: string
  to?: string | null
  subject?: string | null
  text?: string | null
  messageId?: string | null
  inReplyTo?: string | null
  references?: string | null
  headers?: Record<string, string>
  receivedAt?: Date
  attachments?: { filename: string; contentType: string; size: number }[]
  source: 'webhook' | 'imap' | 'manual'
}

const CLEAN_MSGID = (s: string | null | undefined) => (s ? s.trim().replace(/^<?/, '<').replace(/>?$/, '>') : null)

/**
 * Ingest one inbound email: dedupe, link to the outbound message / prospect / conversation, classify,
 * and apply effects (stop sequence, CRM status, suppression, follow-up task). Idempotent on Message-ID.
 */
export async function processInbound(e: InboundEmail): Promise<{ inboundId: string | null; duplicate: boolean; classification: Classification; businessId: string | null }> {
  const db = sql()
  const from = normalizeEmail(e.from.match(/<([^>]+)>/)?.[1] ?? e.from) ?? e.from.toLowerCase()
  const msgId = CLEAN_MSGID(e.messageId)
  if (msgId) {
    const [dup] = await db<{ id: string; classification: Classification; business_id: string | null }[]>`select id, classification, business_id from inbound_messages where message_id_header = ${msgId}`
    if (dup) return { inboundId: dup.id, duplicate: true, classification: dup.classification ?? 'UNKNOWN', businessId: dup.business_id }
  }
  // 1) thread headers → our outbound Message-ID
  const refs = [CLEAN_MSGID(e.inReplyTo), ...(e.references ?? '').split(/\s+/).map(CLEAN_MSGID)].filter((x): x is string => !!x)
  let outbound: { id: string; business_id: string | null; campaign_id: string | null; campaign_prospect_id: string | null; conversation_id: string | null } | undefined
  if (refs.length)
    [outbound] = await db`select id, business_id, campaign_id, campaign_prospect_id, conversation_id from outbound_messages where message_id_header in ${db(refs)} order by sent_at desc nulls last limit 1`
  // 2) sender address → last message sent to that address
  if (!outbound)
    [outbound] = await db`select id, business_id, campaign_id, campaign_prospect_id, conversation_id from outbound_messages where lower(to_email) = ${from} and status in ('SENT','DELIVERED') order by sent_at desc limit 1`
  let businessId = outbound?.business_id ?? null
  // 3) sender address → known business contact
  if (!businessId) {
    const [c] = await db<{ business_id: string }[]>`select business_id from business_contacts where kind = 'email' and normalized_value = ${from} limit 1`
    businessId = c?.business_id ?? null
  }
  const text = (e.text ?? '').slice(0, 100_000)
  const subject = (e.subject ?? '').slice(0, 500)
  const headers = e.headers ?? {}
  // classification
  let label: Classification
  let confidence: number
  let source = 'rules'
  let summary: string | null = null
  let suggested: string | null = null
  let meeting = false
  const rule = classifyByRules({ from, subject, text, headers })
  if (rule) ({ label, confidence } = rule)
  else {
    const avail = await aiAvailability()
    if (avail.available) {
      try {
        const r = await generateStructured({
          task: 'reply_classification',
          system: REPLY_SYSTEM_PROMPT,
          instructions: 'Analyse la réponse ci-dessous.',
          untrustedData: { objet: subject, message: stripQuoted(text).slice(0, 6000) },
          schema: aiReplyAnalysisSchema,
          businessId,
        })
        label = r.data.label
        confidence = Math.max(0, Math.min(1, r.data.confidence))
        summary = r.data.summary
        suggested = r.data.suggestedReply
        meeting = r.data.meetingRequested
        source = `ai:${r.model}`
      } catch {
        ;({ label, confidence } = classifyByKeywords({ from, subject, text, headers }))
        source = 'keywords'
      }
    } else {
      ;({ label, confidence } = classifyByKeywords({ from, subject, text, headers }))
      source = 'keywords'
    }
  }
  if (label === 'MEETING_REQUEST') meeting = true
  // conversation
  let conversationId = outbound?.conversation_id ?? null
  if (!conversationId && businessId) {
    const [c] = await db<{ id: string }[]>`select id from conversations where business_id = ${businessId} order by created_at desc limit 1`
    conversationId = c?.id ?? null
  }
  if (!conversationId) {
    const [c] = await db<{ id: string }[]>`insert into conversations (business_id, campaign_id, subject) values (${businessId}, ${outbound?.campaign_id ?? null}, ${subject}) returning id`
    conversationId = c!.id
    if (outbound) await db`update outbound_messages set conversation_id = ${conversationId} where id = ${outbound.id}`
  }
  const needsAttention = !['OUT_OF_OFFICE', 'BOUNCE'].includes(label)
  const [row] = await db<{ id: string }[]>`insert into inbound_messages (conversation_id, business_id, outbound_message_id, from_email, to_email, subject, body_text, message_id_header,
      in_reply_to, references_header, headers, attachments, received_at, source, classification, classification_confidence, classification_source, summary, suggested_reply, processed_at)
    values (${conversationId}, ${businessId}, ${outbound?.id ?? null}, ${from}, ${e.to ?? null}, ${subject}, ${text}, ${msgId}, ${CLEAN_MSGID(e.inReplyTo)}, ${e.references ?? null},
      ${db.json(headers)}, ${db.json((e.attachments ?? []) as never)}, ${e.receivedAt ?? new Date()}, ${e.source}, ${label}, ${confidence}, ${source}, ${summary}, ${suggested}, now())
    on conflict (message_id_header) do nothing returning id`
  if (!row) return { inboundId: null, duplicate: true, classification: label, businessId }
  await db`update conversations set last_message_at = now(), unread = true, last_classification = ${label},
             status = ${needsAttention ? 'NEEDS_ATTENTION' : 'WAITING'}, business_id = coalesce(business_id, ${businessId}) where id = ${conversationId}`
  await applyEffects({ label, businessId, from, campaignProspectId: outbound?.campaign_prospect_id ?? null, conversationId, meeting, inboundId: row.id })
  await auditLog({ action: 'inbound.received', entityType: businessId ? 'business' : undefined, entityId: businessId, data: { inboundId: row.id, label, source, confidence } })
  return { inboundId: row.id, duplicate: false, classification: label, businessId }
}

async function applyEffects(x: { label: Classification; businessId: string | null; from: string; campaignProspectId: string | null; conversationId: string; meeting: boolean; inboundId: string }) {
  const db = sql()
  const stopFor = async (status: string, reason: string) => {
    const cpFilter = x.campaignProspectId
      ? db`id = ${x.campaignProspectId}`
      : x.businessId
        ? db`business_id = ${x.businessId}`
        : db`lower(contact_email) = ${x.from}`
    const cps = await db<{ id: string }[]>`update campaign_prospects set status = ${status}, stop_reason = ${reason}, next_send_at = null
      where ${cpFilter} and status in ('PENDING','APPROVED','ACTIVE') returning id`
    if (cps.length)
      await db`update outbound_messages set status = 'CANCELLED', last_error = ${'Séquence arrêtée : ' + reason}
               where campaign_prospect_id in ${db(cps.map((c) => c.id))} and status in ('DRAFT','AWAITING_APPROVAL','SCHEDULED')`
  }
  switch (x.label) {
    case 'OUT_OF_OFFICE':
      return // sequence continues
    case 'BOUNCE':
      await suppress({ email: x.from.startsWith('mailer-daemon') || x.from.startsWith('postmaster') ? null : x.from, businessId: x.businessId, reason: 'BOUNCE', source: 'inbound' }).catch(() => undefined)
      await stopFor('BOUNCED', 'rebond')
      return
    case 'UNSUBSCRIBE':
      await suppress({ email: x.from, businessId: x.businessId, reason: 'UNSUBSCRIBE', source: 'reply' })
      return
    case 'NOT_INTERESTED':
      await stopFor('REPLIED', 'réponse négative')
      if (x.businessId) await db`update businesses set pipeline_status = 'LOST' where id = ${x.businessId} and pipeline_status not in ('WON','DO_NOT_CONTACT')`
      return
    default: {
      await stopFor('REPLIED', `réponse ${x.label}`)
      if (x.businessId) {
        const next = x.meeting || x.label === 'INTERESTED' ? 'INTERESTED' : 'REPLIED' // a meeting REQUEST is not a booked meeting: the admin confirms it
        await db`update businesses set pipeline_status = ${next}
                 where id = ${x.businessId} and pipeline_status in ('NEW','DISCOVERED','ENRICHED','QUALIFIED','WEBSITE_GENERATED','CONTACTED','REPLIED','INTERESTED')`
        await db`insert into crm_tasks (business_id, conversation_id, title, due_at, source)
                 values (${x.businessId}, ${x.conversationId}, ${x.meeting ? 'Planifier le rendez-vous demandé' : 'Répondre au prospect'}, now() + interval '1 day', 'inbound')`
      }
    }
  }
}
