import { sql } from '../core/db'
import type { Period } from './period'

const SENT = ['SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED']

export async function analytics(p: Period) {
  const db = sql()
  const [funnel] = await db<Record<string, number>[]>`select
      (select count(*)::int from businesses where created_at between ${p.from} and ${p.to} and merged_into is null) found,
      (select count(*)::int from businesses where created_at between ${p.from} and ${p.to} and merged_into is null and score >= 55) qualified,
      (select count(*)::int from businesses where created_at between ${p.from} and ${p.to} and merged_into is null and email is not null and email_status <> 'INVALID') with_email,
      (select count(*)::int from outbound_messages where not is_test and status in ${db(SENT)} and sent_at between ${p.from} and ${p.to}) sent,
      (select count(*)::int from outbound_messages where not is_test and status = 'DELIVERED' and sent_at between ${p.from} and ${p.to}) delivered,
      (select count(*)::int from outbound_messages where not is_test and status = 'BOUNCED' and sent_at between ${p.from} and ${p.to}) bounced,
      (select count(distinct business_id)::int from outbound_messages where not is_test and status in ${db(SENT)} and sent_at between ${p.from} and ${p.to}) contacted,
      (select count(distinct i.business_id)::int from inbound_messages i where i.classification not in ('BOUNCE','OUT_OF_OFFICE') and i.received_at between ${p.from} and ${p.to}) replied,
      (select count(distinct i.business_id)::int from inbound_messages i where i.classification in ('INTERESTED','MEETING_REQUEST') and i.received_at between ${p.from} and ${p.to}) positive,
      (select count(distinct entity_id)::int from audit_logs where action = 'business.status' and data->>'to' = 'MEETING_BOOKED' and created_at between ${p.from} and ${p.to}) meetings,
      (select count(*)::int from crm_opportunities where status = 'WON' and signed_at between ${p.from} and ${p.to}) won,
      (select coalesce(sum(amount_cents),0)::int from crm_opportunities where status = 'WON' and signed_at between ${p.from} and ${p.to}) revenue,
      (select coalesce(sum(paid_cents),0)::int from crm_opportunities where status = 'WON' and signed_at between ${p.from} and ${p.to}) paid`
  const [tech] = await db<Record<string, number | string>[]>`select
      (select count(*)::int from generated_websites where created_at between ${p.from} and ${p.to}) sites,
      (select count(*)::int from generated_websites where status = 'ERROR' and created_at between ${p.from} and ${p.to}) sites_error,
      (select coalesce(avg(duration_ms),0)::int from generated_websites where status <> 'ERROR' and created_at between ${p.from} and ${p.to}) avg_gen_ms,
      (select coalesce(avg(cost_usd),0)::text from generated_websites where created_at between ${p.from} and ${p.to}) avg_gen_cost,
      (select coalesce(sum(cost_usd),0)::text from api_usage where created_at between ${p.from} and ${p.to} and operation in ('site_generation','proposal','reply_classification','reply_draft','analysis')) ai_cost,
      (select coalesce(sum(cost_usd),0)::text from api_usage where created_at between ${p.from} and ${p.to} and operation not in ('site_generation','proposal','reply_classification','reply_draft','analysis')) enrichment_cost,
      (select count(*)::int from automation_jobs where status = 'FAILED' and finished_at between ${p.from} and ${p.to}) jobs_failed,
      (select count(*)::int from automation_jobs where status = 'COMPLETED' and finished_at between ${p.from} and ${p.to}) jobs_done,
      (select coalesce(avg(extract(epoch from finished_at - started_at)),0)::numeric(10,1)::text from automation_jobs where status = 'COMPLETED' and finished_at between ${p.from} and ${p.to}) avg_job_s`
  const segment = (dim: ReturnType<typeof db>) => db<{ key: string | null; prospects: number; contacted: number; replied: number; positive: number; won: number }[]>`
    select ${dim} as key, count(distinct b.id)::int prospects,
      count(distinct b.id) filter (where exists (select 1 from outbound_messages o where o.business_id = b.id and not o.is_test and o.status in ${db(SENT)} and o.sent_at between ${p.from} and ${p.to}))::int contacted,
      count(distinct b.id) filter (where exists (select 1 from inbound_messages i where i.business_id = b.id and i.classification not in ('BOUNCE','OUT_OF_OFFICE') and i.received_at between ${p.from} and ${p.to}))::int replied,
      count(distinct b.id) filter (where exists (select 1 from inbound_messages i where i.business_id = b.id and i.classification in ('INTERESTED','MEETING_REQUEST') and i.received_at between ${p.from} and ${p.to}))::int positive,
      count(distinct b.id) filter (where b.pipeline_status = 'WON')::int won
    from businesses b where b.merged_into is null group by 1 order by contacted desc, prospects desc limit 15`
  const [byCity, bySector] = await Promise.all([segment(db`coalesce(b.city, '—')`), segment(db`coalesce(b.sector, '—')`)])
  const byCampaign = await db<{ key: string; sent: number; contacted: number; replied: number; positive: number }[]>`
    select c.name as key,
      (select count(*)::int from outbound_messages o where o.campaign_id = c.id and o.status in ${db(SENT)} and o.sent_at between ${p.from} and ${p.to}) sent,
      (select count(distinct o.business_id)::int from outbound_messages o where o.campaign_id = c.id and o.status in ${db(SENT)} and o.sent_at between ${p.from} and ${p.to}) contacted,
      (select count(distinct i.business_id)::int from inbound_messages i join outbound_messages o on o.id = i.outbound_message_id where o.campaign_id = c.id and i.classification not in ('BOUNCE','OUT_OF_OFFICE') and i.received_at between ${p.from} and ${p.to}) replied,
      (select count(distinct i.business_id)::int from inbound_messages i join outbound_messages o on o.id = i.outbound_message_id where o.campaign_id = c.id and i.classification in ('INTERESTED','MEETING_REQUEST') and i.received_at between ${p.from} and ${p.to}) positive
    from campaigns c order by sent desc limit 20`
  const byOffer = await db<{ key: string; opportunities: number; won: number; revenue: number }[]>`
    select coalesce(so.name, 'Sans offre') as key, count(o.id)::int opportunities, count(o.id) filter (where o.status = 'WON')::int won, coalesce(sum(o.amount_cents) filter (where o.status = 'WON'),0)::int revenue
    from crm_opportunities o left join sales_offers so on so.id = o.offer_id where o.created_at between ${p.from} and ${p.to} group by 1 order by 2 desc`
  const byModel = await db<{ key: string; calls: number; failures: number; input_tokens: number; output_tokens: number; cost: string }[]>`
    select coalesce(model, provider) as key, count(*)::int calls, count(*) filter (where not success)::int failures, sum(input_tokens)::int input_tokens, sum(output_tokens)::int output_tokens, sum(cost_usd)::text cost
    from api_usage where created_at between ${p.from} and ${p.to} group by 1 order by sum(cost_usd) desc`
  const byTemplate = await db<{ key: string; sites: number; views: number; contacted: number; positive: number }[]>`
    select g.template_id as key, count(*)::int sites, sum(g.view_count)::int views,
      count(distinct g.business_id) filter (where exists (select 1 from outbound_messages o where o.business_id = g.business_id and o.status in ${db(SENT)}))::int contacted,
      count(distinct g.business_id) filter (where exists (select 1 from inbound_messages i where i.business_id = g.business_id and i.classification in ('INTERESTED','MEETING_REQUEST')))::int positive
    from generated_websites g where g.created_at between ${p.from} and ${p.to} group by 1 order by 2 desc`
  const weekly = await db<{ week: string; sent: number; replies: number; positive: number }[]>`
    with w as (select generate_series(date_trunc('week', ${p.from}::timestamptz), date_trunc('week', ${p.to}::timestamptz), interval '1 week') d)
    select to_char(d, 'YYYY-MM-DD') as week,
      (select count(*)::int from outbound_messages where not is_test and status in ${db(SENT)} and sent_at >= d and sent_at < d + interval '1 week') sent,
      (select count(*)::int from inbound_messages where classification not in ('BOUNCE','OUT_OF_OFFICE') and received_at >= d and received_at < d + interval '1 week') replies,
      (select count(*)::int from inbound_messages where classification in ('INTERESTED','MEETING_REQUEST') and received_at >= d and received_at < d + interval '1 week') positive
    from w order by d`
  return { funnel: funnel!, tech: tech!, byCity, bySector, byCampaign, byOffer, byModel, byTemplate, weekly }
}
