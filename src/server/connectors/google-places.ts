import { getSecret, getSettings } from '../core/settings'
import { TransientError } from '../core/errors'
import { SECTOR_BY_ID } from '@/lib/sectors'
import type { Connector, RawPlace } from './types'

/**
 * Google Places API (New) — optional, requires GOOGLE_PLACES_API_KEY.
 * Google's terms forbid building a permanent copy of Places content: we only persist the place_id
 * (allowed indefinitely) and use the live response to (a) discover businesses and (b) check website
 * presence. Raw Places content is NOT stored in business_sources.raw.
 */
export async function googleTextSearch(apiKey: string, textQuery: string, lat: number, lon: number, radiusKm: number) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber,places.businessStatus,places.primaryType',
    },
    body: JSON.stringify({ textQuery, languageCode: 'fr', locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: Math.min(radiusKm * 1000, 50000) } }, pageSize: 20 }),
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 429 || res.status >= 500) throw new TransientError(`Google Places HTTP ${res.status}`)
  if (!res.ok) throw new Error(`Google Places HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return ((await res.json()) as { places?: GPlace[] }).places ?? []
}

interface GPlace {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  websiteUri?: string
  nationalPhoneNumber?: string
  businessStatus?: string
  primaryType?: string
}

export const googlePlacesConnector: Connector = {
  id: 'google_places',
  label: 'Google Places (optionnel)',
  async status() {
    const s = await getSettings()
    const key = await getSecret('GOOGLE_PLACES_API_KEY')
    return { configured: !!key, enabled: s.search.sources.google_places, message: key ? 'Clé configurée' : 'Non configuré : GOOGLE_PLACES_API_KEY manquante' }
  },
  async search(q, log) {
    const key = await getSecret('GOOGLE_PLACES_API_KEY')
    if (!key) return []
    const label = q.sector ? SECTOR_BY_ID.get(q.sector)?.label : ''
    const text = [label, q.keywords, q.city].filter(Boolean).join(' ')
    const places = await googleTextSearch(key, text, q.lat, q.lon, q.radiusKm)
    await log(`Google Places : ${places.length} résultats (non persistés hors place_id)`)
    return places
      .filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY')
      .map<RawPlace>((p) => ({
        source: 'google_places',
        sourceRecordId: p.id,
        license: 'Google Maps Platform ToS — contenu non stocké',
        name: p.displayName?.text ?? '',
        sector: q.sector ?? null,
        sourceCategory: p.primaryType ?? null,
        address: p.formattedAddress ?? null,
        postcode: null,
        city: q.city ?? null,
        region: null,
        country: q.country,
        lat: p.location?.latitude ?? null,
        lon: p.location?.longitude ?? null,
        phones: p.nationalPhoneNumber ? [p.nationalPhoneNumber] : [],
        websites: p.websiteUri ? [p.websiteUri] : [],
        emails: [],
        socials: [],
        operatingStatus: p.businessStatus === 'OPERATIONAL' ? 'open' : null,
        confidence: 0.85,
        raw: {}, // intentionally empty (ToS)
      }))
      .filter((p) => p.name)
  },
}
