import { sql } from '../core/db'
import { randomToken } from '../core/crypto'
import { AppError } from '../core/errors'
import { getSettings } from '../core/settings'
import { messageIdFor, withComplianceFooter } from './compose'
import { isSuppressed } from './suppression'
import { sendOutbound } from './send'

/** Reply from the inbox. Sending is an explicit admin action (the approval step). Threaded with In-Reply-To. */
export async function replyToConversation(conversationId: string, input: { subject: string; body: string }) {
  const db = sql()
  const [last] = await db<{ id: string; from_email: string; subject: string | null; message_id_header: string | null; references_header: string | null; business_id: string | null }[]>`
    select id, from_email, subject, message_id_header, references_header, business_id from inbound_messages where conversation_id = ${conversationId} order by received_at desc limit 1`
  if (!last) throw new AppError('Aucun message reçu dans cette conversation', 400)
  if (await isSuppressed(last.from_email)) throw new AppError('Ce contact a demandé à ne plus être contacté', 409, 'SUPPRESSED')
  const s = await getSettings()
  if (!s.outreach.senderEmail) throw new AppError('Email expéditeur non configuré (Paramètres → Prospection)', 412, 'NOT_CONFIGURED')
  const unsub = randomToken(18)
  const [m] = await db<{ id: string }[]>`insert into outbound_messages (business_id, conversation_id, to_email, from_email, from_name, reply_to, subject, body_text, status, scheduled_at,
      unsubscribe_token, idempotency_key, in_reply_to, references_header)
    values (${last.business_id}, ${conversationId}, ${last.from_email}, ${s.outreach.senderEmail}, ${s.outreach.senderName || null}, ${s.outreach.replyTo || null}, ${input.subject},
      ${await withComplianceFooter(input.body, unsub)}, 'SCHEDULED', now(), ${unsub}, ${'reply:' + randomToken(12)}, ${last.message_id_header}, ${[last.references_header, last.message_id_header].filter(Boolean).join(' ') || null})
    returning id`
  await db`update outbound_messages set message_id_header = ${messageIdFor(m!.id, s.outreach.senderEmail)} where id = ${m!.id}`
  const r = await sendOutbound(m!.id)
  await db`update conversations set status = 'WAITING', unread = false, last_message_at = now() where id = ${conversationId}`
  return { messageId: m!.id, ...r }
}
