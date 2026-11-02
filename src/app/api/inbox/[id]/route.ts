import { z } from 'zod'
import { sql } from '@/server/core/db'
import { AppError } from '@/server/core/errors'
import { adminRoute } from '@/server/http/route'
import { replyToConversation } from '@/server/email/reply'
import { suppress } from '@/server/email/suppression'

export const GET = adminRoute(async ({ params }) => {
  const db = sql()
  const [c] = await db`select c.*, b.name business_name, b.pipeline_status from conversations c left join businesses b on b.id = c.business_id where c.id = ${params.id}`
  if (!c) throw new AppError('Conversation introuvable', 404)
  const inbound = await db`select id, from_email, subject, body_text, received_at, classification, classification_confidence, classification_source, summary, suggested_reply, attachments from inbound_messages where conversation_id = ${params.id}`
  const outbound = c.business_id
    ? await db`select id, to_email, subject, body_text, status, sent_at, scheduled_at, step from outbound_messages where (conversation_id = ${params.id} or business_id = ${c.business_id}) and status not in ('CANCELLED','DRAFT') order by created_at`
    : await db`select id, to_email, subject, body_text, status, sent_at, scheduled_at, step from outbound_messages where conversation_id = ${params.id} order by created_at`
  await db`update conversations set unread = false where id = ${params.id}`
  return { conversation: c, inbound, outbound }
})

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reply'), subject: z.string().min(1).max(300), body: z.string().min(1).max(20000) }),
  z.object({ action: z.literal('status'), status: z.enum(['OPEN', 'NEEDS_ATTENTION', 'WAITING', 'CLOSED']) }),
  z.object({ action: z.literal('reclassify'), inboundId: z.string().uuid(), classification: z.enum(['INTERESTED', 'NOT_INTERESTED', 'QUESTION', 'OBJECTION', 'MEETING_REQUEST', 'UNSUBSCRIBE', 'OUT_OF_OFFICE', 'BOUNCE', 'UNKNOWN']) }),
  z.object({ action: z.literal('notes'), notes: z.string().max(10000) }),
])

export const POST = adminRoute(async ({ params, body }) => {
  const db = sql()
  switch (body.action) {
    case 'reply':
      return replyToConversation(params.id, body)
    case 'status':
      await db`update conversations set status = ${body.status} where id = ${params.id}`
      return { ok: true }
    case 'notes':
      await db`update conversations set notes = ${body.notes} where id = ${params.id}`
      return { ok: true }
    case 'reclassify': {
      const [i] = await db<{ from_email: string; business_id: string | null }[]>`update inbound_messages set classification = ${body.classification}, classification_source = 'manual', classification_confidence = 1
        where id = ${body.inboundId} and conversation_id = ${params.id} returning from_email, business_id`
      if (i && body.classification === 'UNSUBSCRIBE') await suppress({ email: i.from_email, businessId: i.business_id, reason: 'UNSUBSCRIBE', source: 'manual-reclassify' })
      await db`update conversations set last_classification = ${body.classification} where id = ${params.id}`
      return { ok: true }
    }
  }
}, schema)
