import { z } from 'zod'
import { sql } from '../core/db'
import { randomToken } from '../core/crypto'
import { getSettings } from '../core/settings'
import { AppError } from '../core/errors'
import { messageIdFor, withComplianceFooter } from './compose'
import { sendOutbound } from './send'

export const testEmailSchema = z.object({ to: z.string().email(), subject: z.string().min(1).max(200), body: z.string().min(1).max(10000) })

/** Send a single test email through the configured provider (marked is_test, not counted in analytics). */
export async function sendTestEmail(input: unknown) {
  const t = testEmailSchema.parse(input)
  const s = await getSettings()
  if (!s.outreach.senderEmail) throw new AppError('Renseignez l’email expéditeur dans Paramètres → Prospection', 412, 'NOT_CONFIGURED')
  const db = sql()
  const unsub = randomToken(18)
  const [m] = await db<{ id: string }[]>`insert into outbound_messages (to_email, from_email, from_name, reply_to, subject, body_text, status, scheduled_at, unsubscribe_token, idempotency_key, is_test)
    values (${t.to}, ${s.outreach.senderEmail}, ${s.outreach.senderName || null}, ${s.outreach.replyTo || null}, ${t.subject}, ${await withComplianceFooter(t.body, unsub)}, 'SCHEDULED', now(), ${unsub}, ${'test:' + randomToken(12)}, true)
    returning id`
  await db`update outbound_messages set message_id_header = ${messageIdFor(m!.id, s.outreach.senderEmail)} where id = ${m!.id}`
  const r = await sendOutbound(m!.id)
  const [row] = await db<{ status: string; provider: string | null; provider_message_id: string | null; last_error: string | null }[]>`select status, provider, provider_message_id, last_error from outbound_messages where id = ${m!.id}`
  return { messageId: m!.id, outcome: r.outcome, ...row }
}
