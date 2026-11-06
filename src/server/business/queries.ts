import { z } from 'zod'
import { sql } from '../core/db'
import type {BusinessSummary} from '@/lib/business-summary'

export const listFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  runId: z.string().uuid().optional(),
  ids: z.string().optional(), // comma separated
  presence: z.string().optional(), // comma separated statuses
  websiteFilter: z.enum(['any', 'no_website', 'no_website_confirmed', 'has_website', 'website_issues']).default('any'),
  sector: z.string().max(50).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(2).optional(),
  pipeline: z.string().optional(),
  priority: z.string().optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  requireEmail: z.enum(['true', 'false']).optional(),
  requirePhone: z.enum(['true', 'false']).optional(),
  excludeContacted: z.enum(['true', 'false']).optional(),
  tag: z.string().max(50).optional(),
  archived: z.enum(['true', 'false']).default('false'),
  sort: z.enum(['score', 'name', 'created', 'city', 'confidence']).default('score'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(500).default(50),
})
export type ListFilters = z.infer<typeof listFiltersSchema>

export interface BusinessRow {
  id: string
  name: string
  sector: string | null
  city: string | null
  postcode: string | null
  address: string | null
  country: string | null
  lat: number | null
  lon: number | null
  phone: string | null
  email: string | null
  email_status: string
  website_url: string | null
  web_presence_status: string
  pipeline_status: string
  score: number | null
  data_confidence: number | null
  priority: string | null
  tags: string[]
  sources: string[]
  summary: BusinessSummary | null
  enriching: boolean
  sites: number
  created_at: Date
}

const CONTACTED = ['CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING_BOOKED', 'NEGOTIATION', 'WON', 'LOST', 'DO_NOT_CONTACT']

function where(f: ListFilters) {
  const db = sql()
  const parts = [db`b.merged_into is null`, f.archived === 'true' ? db`b.archived_at is not null` : db`b.archived_at is null`]
  if (f.q) {
    const like = `%${f.q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}%`
    parts.push(db`(b.search_text like ${like} or b.phone like ${'%' + f.q.replace(/\D/g, '').slice(-9) + '%'} and length(${f.q.replace(/\D/g, '')}) >= 6 or b.siret = ${f.q})`)
  }
  if (f.runId) parts.push(db`b.id = any(select unnest(business_ids) from search_runs where id = ${f.runId})`)
  if (f.ids) parts.push(db`b.id = any(${f.ids.split(',').filter((x) => /^[0-9a-f-]{36}$/.test(x))}::uuid[])`)
  if (f.presence) parts.push(db`b.web_presence_status = any(${f.presence.split(',')})`)
  if (f.websiteFilter === 'no_website') parts.push(db`b.web_presence_status in ('NO_WEBSITE_KNOWN','NO_WEBSITE_CONFIRMED')`)
  if (f.websiteFilter === 'no_website_confirmed') parts.push(db`b.web_presence_status = 'NO_WEBSITE_CONFIRMED'`)
  if (f.websiteFilter === 'has_website') parts.push(db`b.website_url is not null`)
  if (f.websiteFilter === 'website_issues') parts.push(db`b.web_presence_status in ('WEBSITE_BROKEN','WEBSITE_OUTDATED','WEBSITE_LOW_QUALITY')`)
  if (f.sector) parts.push(db`b.sector = ${f.sector}`)
  if (f.city) parts.push(db`lower(b.city) = lower(${f.city})`)
  if (f.country) parts.push(db`b.country = ${f.country}`)
  if (f.pipeline) parts.push(db`b.pipeline_status = any(${f.pipeline.split(',')})`)
  if (f.priority) parts.push(db`b.priority = any(${f.priority.split(',')})`)
  if (f.minScore !== undefined) parts.push(db`b.score >= ${f.minScore}`)
  if (f.requireEmail === 'true') parts.push(db`b.email is not null and b.email_status <> 'INVALID'`)
  if (f.requirePhone === 'true') parts.push(db`b.phone is not null`)
  if (f.excludeContacted === 'true') parts.push(db`not (b.pipeline_status = any(${CONTACTED})) and not b.do_not_contact`)
  if (f.tag) parts.push(db`${f.tag} = any(b.tags)`)
  return parts.reduce((acc, p) => db`${acc} and ${p}`)
}

export async function listBusinesses(f: ListFilters): Promise<{ rows: BusinessRow[]; total: number }> {
  const db = sql()
  const w = where(f)
  const order = { score: db`b.score`, name: db`b.normalized_name`, created: db`b.created_at`, city: db`b.city`, confidence: db`b.data_confidence` }[f.sort]
  const dir = f.dir === 'asc' ? db`asc nulls last` : db`desc nulls last`
  const rows = await db<BusinessRow[]>`
    select b.id, b.name, b.sector, b.city, b.postcode, b.address, b.country, b.lat, b.lon, b.phone, b.email, b.email_status, b.website_url,
      b.web_presence_status, b.pipeline_status, b.score, b.data_confidence, b.priority, b.tags, b.created_at,
      (select e.value from business_enrichments e where e.business_id=b.id and e.field='business_summary' and e.source='summary') summary,
      exists(select 1 from automation_jobs j where j.type='business.enrich' and j.status in ('PENDING','RUNNING','RETRYING') and (j.payload->'businessIds') ? b.id::text) enriching,
      coalesce((select array_agg(distinct s.source) from business_sources s where s.business_id = b.id), '{}') sources,
      (select count(*)::int from generated_websites g where g.business_id = b.id and g.deleted_at is null and g.status = 'READY') sites
    from businesses b where ${w}
    order by ${order} ${dir}, b.id
    limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`
  const [{ n } = { n: 0 }] = await db<{ n: number }[]>`select count(*)::int n from businesses b where ${w}`
  return { rows, total: n }
}

export async function listBusinessIds(f: ListFilters, max = 5000): Promise<string[]> {
  const rows = await sql()<{ id: string }[]>`select b.id from businesses b where ${where(f)} order by b.score desc nulls last limit ${max}`
  return rows.map((r) => r.id)
}

/** CSV with explicit provenance columns. */
export async function exportCsv(f: ListFilters): Promise<string> {
  const db = sql()
  const rows = await db<Record<string, unknown>[]>`
    select b.name, b.sector, b.address, b.postcode, b.city, b.country, b.phone, b.email, b.email_status, b.website_url, b.web_presence_status,
      b.score, b.data_confidence, b.priority, b.pipeline_status, b.siret, b.lat, b.lon, array_to_string(b.tags, '|') tags,
      (select string_agg(distinct s.source, '|') from business_sources s where s.business_id = b.id) sources, b.created_at
    from businesses b where ${where(f)} order by b.score desc nulls last limit 20000`
  const cols = ['name', 'sector', 'address', 'postcode', 'city', 'country', 'phone', 'email', 'email_status', 'website_url', 'web_presence_status', 'score', 'data_confidence', 'priority', 'pipeline_status', 'siret', 'lat', 'lon', 'tags', 'sources', 'created_at']
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    let s = v instanceof Date ? v.toISOString() : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // CSV/formula injection guard
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n')
}
