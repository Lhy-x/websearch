import { sql } from '../core/db'
import { suppress } from './suppression'

export interface ResendEvent {
  type: string
  created_at?: string
  data: { email_id?: string; to?: string[]; bounce?: { type?: string; subType?: string; message?: string } }
}

/** Apply a provider delivery event. Idempotent on (provider, event id). */
export async function processResendEvent(eventId: string, ev: ResendEvent): Promise<{ applied: boolean; reason?: string }> {
  const db = sql()
  const providerId = ev.data?.email_id
  if (!providerId) return { applied: false, reason: 'email_id manquant' }
  const [m] = await db<{ id: string; to_email: string; business_id: string | null; status: string }[]>`
    select id, to_email, business_id, status from outbound_messages where provider = 'resend' and provider_message_id = ${providerId}`
  if (!m) return { applied: false, reason: 'message inconnu' }
  const ins = await db`insert into email_events (outbound_message_id, provider, provider_event_id, type, payload, occurred_at)
    values (${m.id}, 'resend', ${eventId}, ${ev.type}, ${db.json(ev as never)}, ${ev.created_at ? new Date(ev.created_at) : new Date()})
    on conflict (provider, provider_event_id) do nothing returning id`
  if (!ins.length) return { applied: false, reason: 'événement déjà traité' }
  switch (ev.type) {
    case 'email.delivered':
      await db`update outbound_messages set status = 'DELIVERED', delivered_at = now() where id = ${m.id} and status in ('SENT','SENDING')`
      break
    case 'email.bounced': {
      await db`update outbound_messages set status = 'BOUNCED', last_error = ${ev.data.bounce?.message ?? 'bounce'} where id = ${m.id}`
      const permanent = !ev.data.bounce?.type || /permanent|hard/i.test(ev.data.bounce.type)
      if (permanent) {
        await suppress({ email: m.to_email, businessId: m.business_id, reason: 'BOUNCE', source: 'resend' })
        await db`update business_contacts set status = 'INVALID' where kind = 'email' and normalized_value = ${m.to_email.toLowerCase()}`
      }
      break
    }
    case 'email.complained':
      await db`update outbound_messages set status = 'COMPLAINED' where id = ${m.id}`
      await suppress({ email: m.to_email, businessId: m.business_id, reason: 'COMPLAINT', source: 'resend' })
      break
    default:
      break // sent / delivery_delayed / opened / clicked: recorded only
  }
  return { applied: true }
}
