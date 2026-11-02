import { sql } from '../core/db'
import { env } from '../core/env'
import { normalizeName } from '../core/normalize'
import { BUILTIN_CITIES } from './cities'

export interface GeoPoint {
  lat: number
  lon: number
  label: string
  provider: 'api-adresse' | 'nominatim' | 'builtin' | 'manual' | 'cache'
  approximate: boolean
}

export interface GeocodeInput {
  country: 'FR' | 'BE' | 'CH'
  city?: string | null
  postcode?: string | null
  region?: string | null
}

export function builtinLookup(country: string, city: string): GeoPoint | null {
  const n = normalizeName(city)
  const hit = BUILTIN_CITIES.find(([c, name]) => c === country && normalizeName(name) === n)
  return hit ? { lat: hit[2], lon: hit[3], label: `${hit[1]} (${country})`, provider: 'builtin', approximate: true } : null
}

async function apiAdresse(q: GeocodeInput): Promise<GeoPoint | null> {
  const params = new URLSearchParams({ q: [q.postcode, q.city].filter(Boolean).join(' '), type: 'municipality', limit: '1' })
  if (q.postcode) params.set('postcode', q.postcode)
  const res = await fetch(`https://api-adresse.data.gouv.fr/search/?${params}`, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const data = (await res.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: { label: string; context?: string } }[] }
  const f = data.features?.[0]
  if (!f) return null
  return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: `${f.properties.label} (${f.properties.context ?? 'FR'})`, provider: 'api-adresse', approximate: false }
}

async function nominatim(q: GeocodeInput): Promise<GeoPoint | null> {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: q.country.toLowerCase() })
  if (q.city) params.set('city', q.city)
  if (q.postcode) params.set('postalcode', q.postcode)
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'user-agent': `ProspectForge/0.1 (${env().CRAWLER_CONTACT || 'private tool'})` },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[]
  const f = data[0]
  return f ? { lat: Number(f.lat), lon: Number(f.lon), label: f.display_name, provider: 'nominatim', approximate: false } : null
}

/** Geocode a city/postcode: cache → official/open geocoders → builtin table. Returns null if not found. */
export async function geocode(q: GeocodeInput): Promise<GeoPoint | null> {
  const key = `${q.country}|${normalizeName(q.city ?? '')}|${q.postcode ?? ''}`
  const [cached] = await sql()<{ result: GeoPoint }[]>`select result from geocode_cache where query = ${key}`
  if (cached) return { ...cached.result, provider: cached.result.provider }
  const providers = q.country === 'FR' ? [apiAdresse, nominatim] : [nominatim]
  for (const p of providers) {
    try {
      const r = await p(q)
      if (r) {
        await sql()`insert into geocode_cache (query, result, provider) values (${key}, ${sql().json(r as never)}, ${r.provider}) on conflict do nothing`
        return r
      }
    } catch {
      /* network unavailable → next provider */
    }
  }
  return q.city ? builtinLookup(q.country, q.city) : null
}
