import { sql } from '../core/db'
import type { Period } from './period'

const SENT = ['SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED']

export async function dashboardMetrics(p: Period) {
  const db = sql()
  const [b] = await db<Record<string, number>[]>`select
      count(*)::int total,
      count(*) filter (where created_at between ${p.from} and ${p.to})::int new,
      count(*) filter (where score >= 55 and not do_not_contact)::int qualified,
      count(*) filter (where web_presence_status = 'NO_WEBSITE_CONFIRMED')::int no_site_confirmed,
      count(*) filter (where web_presence_status = 'NO_WEBSITE_KNOWN')::int no_site_known,
      count(*) filter (where pipeline_status = 'MEETING_BOOKED')::int meetings_now
    from businesses where merged_into is null and archived_at is null`
  const [s] = await db<Record<string, number>[]>`select
      count(*) filter (where created_at between ${p.from} and ${p.to} and status <> 'ERROR')::int generated,
      count(*) filter (where status = 'READY' and preview_enabled and (preview_expires_at is null or preview_expires_at > now()))::int published
    from generated_websites`
  const [m] = await db<Record<string, number>[]>`select
      count(*) filter (where status in ${db(SENT)})::int sent,
      count(*) filter (where status = 'DELIVERED')::int delivered,
      count(*) filter (where status = 'BOUNCED')::int bounced,
      count(distinct business_id) filter (where status in ${db(SENT)})::int unique_prospects
    from outbound_messages where not is_test and sent_at between ${p.from} and ${p.to}`
  const [r] = await db<Record<string, number>[]>`select
      count(*) filter (where classification not in ('BOUNCE','OUT_OF_OFFICE'))::int replies,
      count(*) filter (where classification in ('INTERESTED','MEETING_REQUEST'))::int positive,
      count(distinct business_id) filter (where classification not in ('BOUNCE','OUT_OF_OFFICE'))::int replying_prospects
    from inbound_messages where received_at between ${p.from} and ${p.to}`
  const [c] = await db<{ active: number }[]>`select count(*)::int active from campaigns where status = 'ACTIVE'`
  const [o] = await db<{ won: number; revenue: number; paid: number }[]>`select count(*)::int won, coalesce(sum(amount_cents),0)::int revenue, coalesce(sum(paid_cents),0)::int paid
    from crm_opportunities where status = 'WON' and signed_at between ${p.from} and ${p.to}`
  const [meet] = await db<{ n: number }[]>`select count(distinct entity_id)::int n from audit_logs where action = 'business.status' and data->>'to' = 'MEETING_BOOKED' and created_at between ${p.from} and ${p.to}`
  const [cost] = await db<{ usd: string }[]>`select coalesce(sum(cost_usd),0)::text usd from api_usage where created_at between ${p.from} and ${p.to}`
  const [jobs] = await db<{ running: number; pending: number; failed: number }[]>`select
      count(*) filter (where status = 'RUNNING')::int running, count(*) filter (where status in ('PENDING','RETRYING'))::int pending,
      count(*) filter (where status = 'FAILED' and finished_at between ${p.from} and ${p.to})::int failed from automation_jobs`
  const errors = await db<{ id: string; type: string; error: string | null; finished_at: Date }[]>`select id, type, error, finished_at from automation_jobs where status = 'FAILED' order by finished_at desc nulls last limit 6`
  const series = await db<{ day: string; prospects: number; sent: number; replies: number }[]>`
    with days as (select generate_series(date_trunc('day', ${p.from}::timestamptz), date_trunc('day', ${p.to}::timestamptz), interval '1 day') d)
    select to_char(d, 'YYYY-MM-DD') as day,
      (select count(*)::int from businesses where created_at >= d and created_at < d + interval '1 day') prospects,
      (select count(*)::int from outbound_messages where not is_test and status in ${db(SENT)} and sent_at >= d and sent_at < d + interval '1 day') sent,
      (select count(*)::int from inbound_messages where classification not in ('BOUNCE','OUT_OF_OFFICE') and received_at >= d and received_at < d + interval '1 day') replies
    from days order by d`
  return {
    prospects: b!,
    sites: s!,
    messages: m!,
    replies: r!,
    campaignsActive: c!.active,
    won: o!,
    meetings: { inPeriod: meet!.n, current: b!.meetings_now ?? 0 },
    apiCostUsd: Number(cost!.usd),
    jobs: jobs!,
    errors,
    series,
  }
}
