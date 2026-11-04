import { TransientError } from '../core/errors'
import { getRuntimeConfig, getSettings } from '../core/settings'
import { SECTOR_BY_ID, SECTORS } from '@/lib/sectors'
import type { Connector, RawPlace, SearchQuery } from './types'

/**
 * OpenStreetMap through the Overpass API. Disabled by default: the public instance has a fair-use
 * policy, so configure OVERPASS_URL with your own instance for regular use. One query per search.
 * Data © OpenStreetMap contributors, ODbL.
 */
interface OsmEl {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export function buildOverpassQuery(q: SearchQuery): string {
  const sector = q.sector ? SECTOR_BY_ID.get(q.sector) : null
  const tags = sector ? sector.osm : SECTORS.flatMap((s) => s.osm)
  const r = Math.round(Math.min(q.radiusKm, 50) * 1000)
  const parts = tags.map(([k, v]) => `nwr["${k}"="${v}"](around:${r},${q.lat},${q.lon});`).join('\n  ')
  return `[out:json][timeout:60];\n(\n  ${parts}\n);\nout center tags ${Math.min(q.maxResults, 2000)};`
}

export function mapOsm(el: OsmEl, sectorHint: string | null): RawPlace | null {
  const t = el.tags ?? {}
  const name = t.name?.trim()
  if (!name) return null
  const lat = el.lat ?? el.center?.lat ?? null
  const lon = el.lon ?? el.center?.lon ?? null
  let sector = sectorHint
  if (!sector) for (const s of SECTORS) if (s.osm.some(([k, v]) => t[k] === v)) { sector = s.id; break }
  if (sector === 'hair_salon' && (t.hairdresser === 'barber' || /barb/i.test(name))) sector = 'barber'
  const website = t.website || t['contact:website'] || t.url
  const phone = t.phone || t['contact:phone']
  const email = t.email || t['contact:email']
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ')
  return {
    source: 'osm',
    sourceRecordId: `${el.type}/${el.id}`,
    license: 'ODbL (© OpenStreetMap contributors)',
    name,
    sector,
    sourceCategory: Object.entries(t).filter(([k]) => ['shop', 'amenity', 'craft', 'office'].includes(k)).map(([k, v]) => `${k}=${v}`).join(';') || null,
    address: street || null,
    postcode: t['addr:postcode'] ?? null,
    city: t['addr:city'] ?? null,
    region: null,
    country: t['addr:country'] ?? null,
    lat,
    lon,
    phones: phone ? phone.split(';').map((s) => s.trim()) : [],
    websites: website ? [website] : [],
    emails: email ? [email] : [],
    socials: [t['contact:facebook'], t['contact:instagram']].filter((x): x is string => !!x),
    operatingStatus: t.disused || t['disused:shop'] ? 'closed' : 'open',
    confidence: 0.7,
    raw: { opening_hours: t.opening_hours ?? null, tags_checked: Object.keys(t).length },
  }
}

export const osmConnector: Connector = {
  id: 'osm',
  label: 'OpenStreetMap (Overpass)',
  async status() {
    const s = await getSettings()
    const runtime=await getRuntimeConfig(s)
    return { configured: !!runtime.OVERPASS_URL, enabled: s.search.sources.osm, message: `Endpoint : ${runtime.OVERPASS_URL}` }
  },
  async search(q, log) {
    const runtime=await getRuntimeConfig()
    const body = new URLSearchParams({ data: buildOverpassQuery(q) })
    const res = await fetch(runtime.OVERPASS_URL, {
      method: 'POST',
      body,
      headers: { 'user-agent': `ProspectForge/0.1 (${runtime.CRAWLER_CONTACT || 'private tool'})` },
      signal: AbortSignal.timeout(90_000),
    })
    if (res.status === 429 || res.status === 504) throw new TransientError(`Overpass HTTP ${res.status}`, 120_000)
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
    const data = (await res.json()) as { elements?: OsmEl[] }
    const out = (data.elements ?? []).map((e) => mapOsm(e, q.sector ?? null)).filter((p): p is RawPlace => !!p)
    await log(`OSM : ${out.length} éléments`)
    return out
  },
}
