import { sql } from '@/server/core/db'
import { adminRoute } from '@/server/http/route'

export const GET = adminRoute(async ({ req }) => {
  const f = new URL(req.url).searchParams.get('filter') ?? 'all'
  const db = sql()
  const where = f === 'attention' ? db`c.status = 'NEEDS_ATTENTION'` : f === 'unread' ? db`c.unread` : db`true`
  return db`select c.id, c.status, c.unread, c.last_classification, c.last_message_at, c.subject, c.business_id, b.name business_name, cp.name campaign_name,
      (select body_text from inbound_messages i where i.conversation_id = c.id order by received_at desc limit 1) last_body,
      (select summary from inbound_messages i where i.conversation_id = c.id order by received_at desc limit 1) last_summary
    from conversations c left join businesses b on b.id = c.business_id left join campaigns cp on cp.id = c.campaign_id
    where ${where} order by c.last_message_at desc nulls last limit 200`
})
