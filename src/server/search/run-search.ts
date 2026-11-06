import { sql } from '../core/db'
import { errorMessage } from '../core/errors'
import { domainOf, isThirdPartyHost, normalizeName, normalizePhone } from '../core/normalize'
import { getSettings } from '../core/settings'
import { CONNECTOR_BY_ID } from '../connectors'
import type { ConnectorReport, RawPlace, SearchQuery, SourceId } from '../connectors/types'
import { upsertContact } from '../business/contacts'
import { recomputeBusiness } from '../business/recompute'
import type { PresenceEvidence } from '../enrich/presence'
import { clusterRecords, matchBusinesses, type MatchCandidate } from './dedup'
import { geocode } from './geocode'
import type { SearchParams } from './params'
import {refreshBusinessSummary} from '../enrich/summary'

type Log = (msg: string, progress?: number) => Promise<void>

const toCandidate = (p: RawPlace): MatchCandidate & { place: RawPlace } => ({
  name: p.name, city: p.city, lat: p.lat, lon: p.lon, phones: p.phones, websites: p.websites, siret: p.siret, postcode: p.postcode, country: p.country, place: p,
})

/** Pick the representative value for a merged cluster. */
function pick<T>(cluster: RawPlace[], get: (p: RawPlace) => T | null | undefined, prefer: SourceId[] = ['overture', 'osm', 'google_places', 'recherche_entreprises', 'import']): T | null {
  for (const s of prefer) for (const p of cluster) if (p.source === s) {
    const v = get(p)
    if (v !== null && v !== undefined && v !== '') return v
  }
  return null
}

interface DbCandidate {
  id: string
  name: string
  city: string | null
  lat: number | null
  lon: number | null
  phone: string | null
  website_url: string | null
  siret: string | null
  postcode: string | null
  country: string | null
}

async function findExisting(cluster: RawPlace[]): Promise<{ id: string | null; review: { id: string; score: number; reasons: string[] }[] }> {
  const db = sql()
  for (const p of cluster) {
    const [hit] = await db<{ business_id: string }[]>`
      select bs.business_id from business_sources bs join businesses b on b.id = bs.business_id
      where bs.source = ${p.source} and bs.source_record_id = ${p.sourceRecordId} and b.merged_into is null`
    if (hit) return { id: hit.business_id, review: [] }
  }
  const siret = pick(cluster, (p) => p.siret, ['recherche_entreprises', 'import'])
  if (siret) {
    const [hit] = await db<{ id: string }[]>`select id from businesses where siret = ${siret} and merged_into is null`
    if (hit) return { id: hit.id, review: [] }
  }
  const lat = pick(cluster, (p) => p.lat)
  const lon = pick(cluster, (p) => p.lon)
  const phones = cluster.flatMap((p) => p.phones.map((x) => normalizePhone(x, p.country ?? 'FR'))).filter((x): x is string => !!x)
  const domains = cluster.flatMap((p) => p.websites).filter((w) => !isThirdPartyHost(w)).map(domainOf).filter((d): d is string => !!d)
  const candidates = await db<DbCandidate[]>`
    select id, name, city, lat, lon, phone, website_url, siret, postcode, country from businesses
    where merged_into is null and (
      ${lat !== null && lon !== null ? db`(lat between ${lat - 0.004} and ${lat + 0.004} and lon between ${lon - 0.006} and ${lon + 0.006})` : db`false`}
      ${phones.length ? db`or phone in ${db(phones)}` : db``}
      ${domains.length ? db`or domain in ${db(domains)}` : db``}
    ) limit 50`
  const rep: MatchCandidate = {
    name: pick(cluster, (p) => p.name) ?? cluster[0]!.name,
    city: pick(cluster, (p) => p.city),
    lat, lon,
    phones: cluster.flatMap((p) => p.phones),
    websites: cluster.flatMap((p) => p.websites),
    siret, postcode: pick(cluster, (p) => p.postcode), country: pick(cluster, (p) => p.country),
  }
  let best: { id: string; score: number } | null = null
  const review: { id: string; score: number; reasons: string[] }[] = []
  for (const c of candidates) {
    const m = matchBusinesses(rep, { name: c.name, city: c.city, lat: c.lat, lon: c.lon, phones: c.phone ? [c.phone] : [], websites: c.website_url ? [c.website_url] : [], siret: c.siret, postcode: c.postcode, country: c.country })
    if (m.decision === 'MERGE' && (!best || m.score > best.score)) best = { id: c.id, score: m.score }
    else if (m.decision === 'REVIEW') review.push({ id: c.id, score: m.score, reasons: m.reasons })
  }
  return { id: best?.id ?? null, review: best ? [] : review }
}

/** Persist one deduplicated cluster. Returns the business id and whether it was created. */
export async function persistCluster(cluster: RawPlace[]): Promise<{ id: string; created: boolean; pendingMerges: number }> {
  const db = sql()
  const existing = await findExisting(cluster)
  const name = pick(cluster, (p) => p.name)!
  const country = pick(cluster, (p) => p.country) ?? null
  const phone = pick(cluster, (p) => p.phones.map((x) => normalizePhone(x, p.country ?? 'FR')).find(Boolean) ?? null)
  const fields = {
    name,
    normalized_name: normalizeName(name),
    sector: pick(cluster, (p) => p.sector),
    source_category: pick(cluster, (p) => p.sourceCategory),
    naf_code: pick(cluster, (p) => p.naf, ['recherche_entreprises', 'import']),
    address: pick(cluster, (p) => p.address),
    postcode: pick(cluster, (p) => p.postcode),
    city: pick(cluster, (p) => p.city),
    region: pick(cluster, (p) => p.region),
    country: country?.slice(0, 2).toUpperCase() ?? null,
    lat: pick(cluster, (p) => p.lat),
    lon: pick(cluster, (p) => p.lon),
    phone,
    siren: pick(cluster, (p) => p.siren, ['recherche_entreprises', 'import']),
    siret: pick(cluster, (p) => p.siret, ['recherche_entreprises', 'import']),
    operating_status: pick(cluster, (p) => p.operatingStatus),
  }
  let id = existing.id
  let created = false
  if (id) {
    // fill missing fields only — never overwrite data the admin edited
    await db`update businesses set
      sector = coalesce(sector, ${fields.sector}), source_category = coalesce(source_category, ${fields.source_category}),
      naf_code = coalesce(naf_code, ${fields.naf_code}), address = coalesce(address, ${fields.address}),
      postcode = coalesce(postcode, ${fields.postcode}), city = coalesce(city, ${fields.city}), region = coalesce(region, ${fields.region}),
      country = coalesce(country, ${fields.country}), lat = coalesce(lat, ${fields.lat}), lon = coalesce(lon, ${fields.lon}),
      phone = coalesce(phone, ${fields.phone}), siren = coalesce(siren, ${fields.siren}),
      siret = coalesce(siret, ${fields.siret}), operating_status = coalesce(${fields.operating_status}, operating_status)
      where id = ${id}`
  } else {
    const [row] = await db<{ id: string }[]>`insert into businesses ${db({ ...fields, pipeline_status: 'DISCOVERED' })} returning id`
    id = row!.id
    created = true
  }
  for (const p of cluster) {
    const raw = p.source === 'google_places' ? {} : p.raw
    await db`insert into business_sources (business_id, source, source_record_id, source_release, confidence, raw, license)
             values (${id}, ${p.source}, ${p.sourceRecordId}, ${p.sourceRelease ?? null}, ${p.confidence ?? null}, ${db.json(raw as never)}, ${p.license ?? null})
             on conflict (source, source_record_id) do update set fetched_at = now(), raw = excluded.raw, confidence = excluded.confidence,
               source_release = excluded.source_release, business_id = excluded.business_id`
    for (const e of p.emails) await upsertContact(id, { kind: 'email', value: e, source: p.source, status: 'SOURCE_CONFIRMED', confidence: p.confidence })
    for (const t of p.phones) await upsertContact(id, { kind: 'phone', value: t, source: p.source, status: 'SOURCE_CONFIRMED', country: p.country, confidence: p.confidence })
    for (const w of p.websites) await upsertContact(id, { kind: 'website', value: w, source: p.source, status: 'UNVERIFIED', confidence: p.confidence })
    for (const s of p.socials) await upsertContact(id, { kind: 'social', value: s, source: p.source, status: 'UNVERIFIED' })
  }
  // presence evidence per website-capable source (latest observation per source replaces older)
  const now = new Date().toISOString()
  const evidence: PresenceEvidence[] = []
  for (const p of cluster) {
    if (p.source === 'recherche_entreprises') continue
    const own = p.websites.filter((w) => !isThirdPartyHost(w))
    evidence.push({
      source: p.source,
      at: now,
      live: p.source === 'google_places',
      finding: own.length ? 'website_listed' : p.websites.length ? 'third_party_only' : 'no_website',
      detail: p.websites.length ? p.websites.slice(0, 3).join(', ') : undefined,
    })
  }
  if (evidence.length) {
    const sources = evidence.map((e) => e.source)
    await db`update businesses set web_presence_evidence =
               coalesce((select jsonb_agg(e) from jsonb_array_elements(web_presence_evidence) e where not (e->>'source' = any(${sources}))), '[]'::jsonb)
               || ${db.json(evidence as never)}
             where id = ${id}`
  }
  for (const r of existing.review) {
    await db`insert into business_merges (primary_id, candidate_id, score, reasons, status)
             values (${r.id}, ${id}, ${r.score}, ${db.json(r.reasons as never)}, 'PENDING') on conflict do nothing`
  }
  await recomputeBusiness(id)
  await refreshBusinessSummary(id)
  return { id, created, pendingMerges: existing.review.length }
}

export interface SearchRunResult {
  runId: string
  totalFound: number
  newCount: number
  updatedCount: number
  mergePending: number
  reports: ConnectorReport[]
  businessIds: string[]
  newBusinessIds: string[]
}

export async function runSearch(runId: string, params: SearchParams, log: Log, isActive: () => Promise<boolean> = async () => true): Promise<SearchRunResult> {
  const db = sql()
  const settings = await getSettings()
  await db`update search_runs set status = 'RUNNING', started_at = now() where id = ${runId}`
  let lat = params.lat ?? null
  let lon = params.lon ?? null
  if (lat == null || lon == null) {
    const g = await geocode({ country: params.country, city: params.city, postcode: params.postcode })
    if (!g) throw new Error(`Localisation introuvable : ${[params.postcode, params.city].filter(Boolean).join(' ')} (${params.country}). Saisissez des coordonnées.`)
    lat = g.lat
    lon = g.lon
    await log(`Géocodage : ${g.label} via ${g.provider}${g.approximate ? ' (approximatif)' : ''}`)
  }
  const q: SearchQuery = { country: params.country, lat, lon, radiusKm: params.radiusKm, sector: params.sector, keywords: params.keywords, city: params.city, postcode: params.postcode, maxResults: Math.min(params.maxResults, settings.search.maxResults) }
  const enabled = (params.sources ?? (Object.entries(settings.search.sources).filter(([, v]) => v).map(([k]) => k) as SourceId[])) as SourceId[]
  const reports: ConnectorReport[] = []
  const all: RawPlace[] = []
  await Promise.all(
    enabled.map(async (sid) => {
      const c = CONNECTOR_BY_ID.get(sid)
      if (!c) return
      const st = await c.status()
      if (!st.configured) {
        reports.push({ source: sid, status: 'skipped', count: 0, ms: 0, message: st.message })
        return
      }
      const t = Date.now()
      try {
        const res = await c.search(q, (m) => log(m))
        all.push(...res)
        reports.push({ source: sid, status: 'ok', count: res.length, ms: Date.now() - t })
      } catch (e) {
        reports.push({ source: sid, status: 'error', count: 0, ms: Date.now() - t, message: errorMessage(e) })
        await log(`⚠ ${c.label} : ${errorMessage(e)}`)
      }
    }),
  )
  await db`update search_runs set source_reports = ${db.json(reports as never)} where id = ${runId}`
  if (!all.length && reports.every((r) => r.status !== 'ok')) throw new Error('Aucune source n’a répondu : ' + reports.map((r) => `${r.source}: ${r.message ?? r.status}`).join(' ; '))

  const { clusters } = clusterRecords(all.map(toCandidate))
  await log(`${all.length} fiches brutes → ${clusters.length} établissements après dédoublonnage`, 0.3)
  const ids: string[] = []
  const newIds: string[] = []
  let pending = 0
  for (let i = 0; i < clusters.length; i++) {
    if (i % 25 === 0) {
      if (!(await isActive())) throw new Error('Recherche annulée')
      await log(`Enregistrement ${i}/${clusters.length}`, 0.3 + (0.7 * i) / clusters.length)
    }
    const r = await persistCluster(clusters[i]!.map((c) => c.place))
    ids.push(r.id)
    if (r.created) newIds.push(r.id)
    pending += r.pendingMerges
  }
  const uniqueIds = [...new Set(ids)]
  await db`update search_runs set status = 'COMPLETED', finished_at = now(), total_found = ${uniqueIds.length}, new_count = ${newIds.length},
             updated_count = ${uniqueIds.length - newIds.length}, merge_pending_count = ${pending},
             business_ids = ${uniqueIds}::uuid[], new_business_ids = ${newIds}::uuid[],
             params = params || ${db.json({ resolvedLat: lat, resolvedLon: lon })}
           where id = ${runId}`
  return { runId, totalFound: uniqueIds.length, newCount: newIds.length, updatedCount: uniqueIds.length - newIds.length, mergePending: pending, reports, businessIds: uniqueIds, newBusinessIds: newIds }
}
