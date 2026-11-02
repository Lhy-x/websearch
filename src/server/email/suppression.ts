import { sql } from '../core/db'
import { auditLog } from '../core/audit'

export async function isSuppressed(email: string): Promise<boolean> {
  const e = email.toLowerCase()
  const domain = e.split('@')[1] ?? ''
  const [row] = await sql()`select 1 from suppression_list where lower(email) = ${e} or lower(domain) = ${domain} limit 1`
  return !!row
}

/**
 * Add to the global suppression list and stop everything addressed to that contact:
 * pending messages cancelled, campaign enrolments stopped, contact flagged opted-out.
 */
export async function suppress(input: { email?: string | null; domain?: string | null; businessId?: string | null; reason: 'UNSUBSCRIBE' | 'BOUNCE' | 'COMPLAINT' | 'MANUAL' | 'OPPOSITION'; source: string }) {
  const db = sql()
  const email = input.email?.toLowerCase() ?? null
  const domain = input.domain?.toLowerCase() ?? null
  if (email) await db`insert into suppression_list (email, business_id, reason, source) values (${email}, ${input.businessId ?? null}, ${input.reason}, ${input.source}) on conflict do nothing`
  if (domain) await db`insert into suppression_list (domain, business_id, reason, source) values (${domain}, ${input.businessId ?? null}, ${input.reason}, ${input.source}) on conflict do nothing`
  const cancelled = await db`update outbound_messages set status = 'CANCELLED', last_error = ${'Suppression : ' + input.reason}
    where status in ('DRAFT','AWAITING_APPROVAL','SCHEDULED')
      and (${email}::text is not null and lower(to_email) = ${email} or ${domain}::text is not null and split_part(lower(to_email), '@', 2) = ${domain}) returning id`
  const status = input.reason === 'BOUNCE' ? 'BOUNCED' : input.reason === 'MANUAL' ? 'STOPPED' : 'UNSUBSCRIBED'
  await db`update campaign_prospects set status = ${status}, stop_reason = ${input.reason}, next_send_at = null
    where status in ('PENDING','APPROVED','ACTIVE')
      and (${email}::text is not null and lower(contact_email) = ${email} or ${domain}::text is not null and split_part(lower(contact_email), '@', 2) = ${domain}
           or ${input.businessId ?? null}::uuid is not null and business_id = ${input.businessId ?? null})`
  if (email) await db`update business_contacts set opted_out = true where kind = 'email' and normalized_value = ${email}`
  if (input.reason !== 'BOUNCE' && input.businessId)
    await db`update businesses set do_not_contact = true, pipeline_status = 'DO_NOT_CONTACT' where id = ${input.businessId}`
  await auditLog({ action: 'suppression.add', entityType: input.businessId ? 'business' : undefined, entityId: input.businessId, data: { email, domain, reason: input.reason, source: input.source, cancelled: cancelled.length } })
  return { cancelled: cancelled.length }
}
