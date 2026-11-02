import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects, type AsyncBuffer, type FileMetaData } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { env } from '../core/env'
import { TransientError } from '../core/errors'
import { bboxAround, bboxIntersects, haversineKm, type BBox } from '../core/geo'
import { sectorFromOverture } from '@/lib/sectors'
import { getSettings } from '../core/settings'
import type { Connector, RawPlace, SearchQuery } from './types'

/**
 * Overture Maps "places" connector.
 * Reads the official GeoParquet release directly from the public S3 bucket using HTTP range requests:
 * only the parquet footers and the row groups whose bbox statistics intersect the search area are
 * downloaded (typically 5–30 MB for a city), never the 12+ GB global dataset.
 * Licence: CDLA-Permissive-2.0 / ODbL depending on the upstream source (kept per record).
 */
const BUCKET = 'https://overturemaps-us-west-2.s3.amazonaws.com/'
const COLUMNS = ['id', 'names', 'taxonomy', 'basic_category', 'websites', 'phones', 'emails', 'socials', 'addresses', 'bbox', 'confidence', 'operating_status', 'sources']

interface FileHandle {
  key: string
  file: AsyncBuffer
  metadata: FileMetaData
}

const cache: { release?: { value: string; at: number }; files: Map<string, Promise<FileHandle[]>> } = { files: new Map() }

async function s3List(prefix: string, delimiter?: string): Promise<{ keys: string[]; prefixes: string[] }> {
  const url = `${BUCKET}?list-type=2&prefix=${encodeURIComponent(prefix)}${delimiter ? `&delimiter=${encodeURIComponent(delimiter)}` : ''}`
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new TransientError(`Overture S3 list HTTP ${res.status}`)
  const xml = await res.text()
  return {
    keys: [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!),
    prefixes: [...xml.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)].map((m) => m[1]!).filter((p) => p !== prefix),
  }
}

export async function latestOvertureRelease(): Promise<string> {
  if (env().OVERTURE_RELEASE) return env().OVERTURE_RELEASE
  if (cache.release && Date.now() - cache.release.at < 6 * 3600_000) return cache.release.value
  const { prefixes } = await s3List('release/', '/')
  const releases = prefixes.map((p) => p.replace(/^release\//, '').replace(/\/$/, '')).filter((r) => /^\d{4}-\d{2}-\d{2}\.\d+$/.test(r)).sort()
  const value = releases.at(-1)
  if (!value) throw new TransientError('Aucune release Overture trouvée')
  cache.release = { value, at: Date.now() }
  return value
}

function placeFiles(release: string): Promise<FileHandle[]> {
  let p = cache.files.get(release)
  if (!p) {
    p = (async () => {
      const { keys } = await s3List(`release/${release}/theme=places/type=place/`)
      const parquet = keys.filter((k) => k.endsWith('.parquet'))
      if (!parquet.length) throw new Error(`Release Overture ${release} : aucun fichier places`)
      return Promise.all(
        parquet.map(async (key) => {
          const file = await asyncBufferFromUrl({ url: BUCKET + key })
          const metadata = await parquetMetadataAsync(file)
          return { key, file, metadata }
        }),
      )
    })()
    p.catch(() => cache.files.delete(release))
    cache.files.set(release, p)
  }
  return p
}

function rowGroupBBox(rg: FileMetaData['row_groups'][number]): BBox | null {
  const s: Record<string, { min?: unknown; max?: unknown }> = {}
  for (const c of rg.columns) {
    const path = c.meta_data?.path_in_schema
    if (path?.[0] === 'bbox' && path[1]) s[path[1]] = { min: c.meta_data?.statistics?.min_value ?? c.meta_data?.statistics?.min, max: c.meta_data?.statistics?.max_value ?? c.meta_data?.statistics?.max }
  }
  const n = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : NaN)
  if (!s.xmin || !s.xmax || !s.ymin || !s.ymax) return null
  const bb = { xmin: n(s.xmin.min), xmax: n(s.xmax.max), ymin: n(s.ymin.min), ymax: n(s.ymax.max) }
  return Object.values(bb).some(Number.isNaN) ? null : bb
}

interface OvertureRow {
  id: string
  names?: { primary?: string }
  taxonomy?: { primary?: string; hierarchy?: string[] }
  basic_category?: string
  websites?: string[]
  phones?: string[]
  emails?: string[]
  socials?: string[]
  addresses?: { freeform?: string; locality?: string; postcode?: string; region?: string; country?: string }[]
  bbox: { xmin: number; xmax: number; ymin: number; ymax: number }
  confidence?: number
  operating_status?: string
  sources?: { dataset?: string; license?: string; record_id?: string }[]
}

/** Pure mapping, unit-tested. */
export function mapOvertureRow(r: OvertureRow, release: string): RawPlace | null {
  const name = r.names?.primary?.trim()
  if (!name) return null
  const addr = r.addresses?.[0]
  const lat = (r.bbox.ymin + r.bbox.ymax) / 2
  const lon = (r.bbox.xmin + r.bbox.xmax) / 2
  const licenses = [...new Set((r.sources ?? []).map((s) => s.license).filter(Boolean))]
  return {
    source: 'overture',
    sourceRecordId: r.id,
    sourceRelease: release,
    license: licenses.join(', ') || 'CDLA-Permissive-2.0',
    name,
    sector: sectorFromOverture(r.taxonomy?.primary, r.taxonomy?.hierarchy ?? [], name),
    sourceCategory: r.taxonomy?.primary ?? r.basic_category ?? null,
    address: addr?.freeform ?? null,
    postcode: addr?.postcode ?? null,
    city: addr?.locality ?? null,
    region: addr?.region ?? null,
    country: addr?.country ?? null,
    lat,
    lon,
    phones: r.phones ?? [],
    websites: r.websites ?? [],
    emails: r.emails ?? [],
    socials: r.socials ?? [],
    operatingStatus: r.operating_status ?? null,
    confidence: typeof r.confidence === 'number' ? r.confidence : null,
    raw: { taxonomy: r.taxonomy, basic_category: r.basic_category, sources: (r.sources ?? []).map((s) => ({ dataset: s.dataset, record_id: s.record_id, license: s.license })) },
  }
}

export function acceptedSectors(sector: string | null | undefined): Set<string> | null {
  if (!sector) return null
  if (sector === 'hair_salon') return new Set(['hair_salon', 'barber'])
  return new Set([sector])
}

export function matchesKeywords(name: string, category: string | null, keywords: string | null | undefined): boolean {
  if (!keywords?.trim()) return true
  const hay = `${name} ${category ?? ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return keywords
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .some((k) => hay.includes(k))
}

export const overtureConnector: Connector = {
  id: 'overture',
  label: 'Overture Maps (places)',
  async status() {
    const s = await getSettings()
    return { configured: true, enabled: s.search.sources.overture, message: 'Accès public S3, aucune clé requise' }
  },
  async search(q: SearchQuery, log) {
    const release = await latestOvertureRelease()
    await log(`Overture release ${release} — lecture des métadonnées parquet`)
    const files = await placeFiles(release)
    const area = bboxAround(q.lat, q.lon, q.radiusKm)
    const accepted = acceptedSectors(q.sector)
    const out: RawPlace[] = []
    let groups = 0
    await Promise.all(
      files.map(async ({ file, metadata }) => {
        let rowStart = 0
        for (const rg of metadata.row_groups) {
          const n = Number(rg.num_rows)
          const bb = rowGroupBBox(rg)
          if (!bb || bboxIntersects(bb, area)) {
            groups++
            const rows = (await parquetReadObjects({ file, metadata, compressors, rowStart, rowEnd: rowStart + n, columns: COLUMNS })) as unknown as OvertureRow[]
            for (const r of rows) {
              if (!r.bbox || r.bbox.xmin > area.xmax || r.bbox.xmax < area.xmin || r.bbox.ymin > area.ymax || r.bbox.ymax < area.ymin) continue
              const p = mapOvertureRow(r, release)
              if (!p || p.lat === null || p.lon === null) continue
              if (haversineKm(q.lat, q.lon, p.lat, p.lon) > q.radiusKm) continue
              if (accepted && (!p.sector || !accepted.has(p.sector))) continue
              if (!matchesKeywords(p.name, p.sourceCategory, q.keywords)) continue
              if (p.operatingStatus === 'permanently_closed') continue
              out.push(p)
            }
          }
          rowStart += n
        }
      }),
    )
    await log(`Overture : ${groups} row groups lus, ${out.length} établissements retenus`)
    out.sort((a, b) => haversineKm(q.lat, q.lon, a.lat!, a.lon!) - haversineKm(q.lat, q.lon, b.lat!, b.lon!))
    return out.slice(0, q.maxResults)
  },
}
