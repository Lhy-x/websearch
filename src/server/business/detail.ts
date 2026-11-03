import { sql } from '../core/db'

export async function getBusinessDetail(id: string) {
  const db = sql()
  const [b] = await db`select * from businesses where id = ${id}`
  if (!b) return null
  const [sources, contacts, enrichments, audits, scores, sites, proposals, outbound, inbound, notes, tasks, opps, timeline, merges] = await Promise.all([
    db`select source, source_record_id, source_release, confidence, license, fetched_at, raw from business_sources where business_id = ${id} order by fetched_at desc`,
    db`select id, kind, value, normalized_value, label, source, source_url, status, mx_valid, is_role_account, is_primary, opted_out, confidence, retrieved_at, verified_at from business_contacts where business_id = ${id} order by kind, is_primary desc, status`,
    db`select field, value, source, source_url, confidence, retrieved_at, verified_at from business_enrichments where business_id = ${id}`,
    db`select id, url, final_url, http_status, https_ok, load_ms, has_viewport, mobile_overflow, title, meta_description, issues, quality_score, verdict, screenshot_desktop, screenshot_mobile, error, created_at from website_audits where business_id = ${id} order by created_at desc limit 5`,
    db`select score, confidence, priority, reasons, created_at from prospect_scores where business_id = ${id} order by created_at desc limit 10`,
    db`select g.id, g.template_id, g.style, g.status, g.current_version, g.preview_token, g.preview_enabled, g.preview_expires_at, g.generator, g.model, g.cost_usd, g.view_count, g.error, g.created_at,
         (select path from website_assets a where a.website_id = g.id and a.kind = 'thumbnail' order by created_at desc limit 1) thumbnail
       from generated_websites g where business_id = ${id} and g.deleted_at is null order by created_at desc`,
    db`select id, website_id, content, generator, model, cost_usd, created_at from proposals where business_id = ${id} order by created_at desc limit 5`,
    db`select o.id, o.campaign_id, c.name campaign_name, o.step, o.to_email, o.subject, o.body_text, o.status, o.scheduled_at, o.sent_at, o.delivered_at, o.last_error, o.provider_message_id
       from outbound_messages o left join campaigns c on c.id = o.campaign_id where o.business_id = ${id} order by o.created_at desc limit 50`,
    db`select id, conversation_id, from_email, subject, body_text, received_at, classification, classification_source, summary from inbound_messages where business_id = ${id} order by received_at desc limit 50`,
    db`select id, body, created_at from crm_notes where business_id = ${id} order by created_at desc`,
    db`select id, title, due_at, done_at, source from crm_tasks where business_id = ${id} order by done_at nulls first, due_at nulls last`,
    db`select id, title, amount_cents, currency, status, signed_at, paid_cents, paid_at, offer_id from crm_opportunities where business_id = ${id} order by created_at desc`,
    db`select action, actor, data, level, created_at from audit_logs where entity_type = 'business' and entity_id = ${id} order by created_at desc limit 60`,
    db`select m.id, m.score, m.reasons, m.status, case when m.primary_id = ${id} then m.candidate_id else m.primary_id end other_id,
         (select name from businesses where id = case when m.primary_id = ${id} then m.candidate_id else m.primary_id end) other_name
       from business_merges m where (m.primary_id = ${id} or m.candidate_id = ${id}) and m.status = 'PENDING'`,
  ])
  return { business: b, sources, contacts, enrichments, audits, scores, sites, proposals, outbound, inbound, notes, tasks, opps, timeline, merges }
}
export type BusinessDetail = NonNullable<Awaited<ReturnType<typeof getBusinessDetail>>>
