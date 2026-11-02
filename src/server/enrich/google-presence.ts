import { sql } from '../core/db'
import { getSecret } from '../core/settings'
import { isThirdPartyHost } from '../core/normalize'
import { googleTextSearch } from '../connectors/google-places'
import { matchBusinesses } from '../search/dedup'
import { upsertContact } from '../business/contacts'
import { recordUsage } from '../ai/client'
import type { PresenceEvidence } from './presence'

/**
 * Indicative price of one Places Text Search (New) request returning websiteUri (Enterprise field set).
 * Check Google's current price list; the real bill is on your Google Cloud account.
 */
export const GOOGLE_TEXT_SEARCH_USD_ESTIMATE = 0.035

/**
 * Live website-presence check through Google Places (only when GOOGLE_PLACES_API_KEY is configured).
 * The place must match our record (name/position/phone) — "not found on Google" is NOT treated as evidence.
 * Per Google ToS only the place_id is stored.
 */
export async function checkGooglePresence(businessId: string): Promise<PresenceEvidence | null> {
  const key = await getSecret('GOOGLE_PLACES_API_KEY')
  if (!key) return null
  const db = sql()
  const [b] = await db<{ name: string; city: string | null; lat: number | null; lon: number | null; phone: string | null; country: string | null }[]>`
    select name, city, lat, lon, phone, country from businesses where id = ${businessId}`
  if (!b || b.lat == null || b.lon == null) return null
  let places
  try {
    places = await googleTextSearch(key, [b.name, b.city].filter(Boolean).join(' '), b.lat, b.lon, 2)
    await recordUsage({ provider: 'google_places', operation: 'places_text_search', units: 1, costUsd: GOOGLE_TEXT_SEARCH_USD_ESTIMATE, businessId })
  } catch (e) {
    await recordUsage({ provider: 'google_places', operation: 'places_text_search', units: 1, success: false, error: (e as Error).message, businessId })
    throw e
  }
  const me = { name: b.name, city: b.city, lat: b.lat, lon: b.lon, phones: b.phone ? [b.phone] : [], websites: [], country: b.country }
  const match = places
    .map((p) => ({ p, m: matchBusinesses(me, { name: p.displayName?.text ?? '', city: b.city, lat: p.location?.latitude ?? null, lon: p.location?.longitude ?? null, phones: p.nationalPhoneNumber ? [p.nationalPhoneNumber] : [], websites: [], country: b.country }) }))
    .filter((x) => x.m.decision === 'MERGE')
    .sort((x, y) => y.m.score - x.m.score)[0]
  if (!match) return null
  await db`insert into business_sources (business_id, source, source_record_id, confidence, raw, license)
           values (${businessId}, 'google_places', ${match.p.id}, ${match.m.score}, '{}'::jsonb, 'Google Maps Platform ToS — contenu non stocké')
           on conflict (source, source_record_id) do update set fetched_at = now()`
  const site = match.p.websiteUri ?? null
  if (site) await upsertContact(businessId, { kind: 'website', value: site, source: 'google_places', status: 'UNVERIFIED', confidence: 0.85 })
  return {
    source: 'google_places',
    at: new Date().toISOString(),
    live: true,
    finding: !site ? 'no_website' : isThirdPartyHost(site) ? 'third_party_only' : 'website_listed',
    detail: site ? `Google : ${site}` : 'Fiche Google sans site web',
  }
}
