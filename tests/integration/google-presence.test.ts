import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql, closeDb } from '@/server/core/db'
import { resetEnvCache } from '@/server/core/env'
import { persistCluster } from '@/server/search/run-search'
import { enrichBusiness } from '@/server/enrich/crawl'
import type { RawPlace } from '@/server/connectors/types'
import { resetDb } from './helpers'

const place: RawPlace = {
  source: 'overture', sourceRecordId: 'TEST-g-1', name: 'TEST Salon Lumière', sector: 'hair_salon', sourceCategory: 'hair_salon', address: '3 rue Test', postcode: '76000', city: 'Rouen', region: null, country: 'FR',
  lat: 49.4431, lon: 1.0993, phones: ['0235111111'], websites: [], emails: [], socials: [], confidence: 0.9, raw: {},
}

/** Fake Google Places (New) Text Search response — test data only. */
function stubPlaces(places: unknown[]) {
  const real = globalThis.fetch
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith('https://places.googleapis.com/')) return new Response(JSON.stringify({ places }), { status: 200, headers: { 'content-type': 'application/json' } })
    return real(url, init)
  })
}

beforeEach(async () => {
  await resetDb()
  process.env.GOOGLE_PLACES_API_KEY = 'test-key'
  resetEnvCache()
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GOOGLE_PLACES_API_KEY
  resetEnvCache()
})
afterAll(closeDb)

const status = async (id: string) => (await sql()<{ web_presence_status: string }[]>`select web_presence_status from businesses where id = ${id}`)[0]!.web_presence_status

describe('live presence check (Google Places)', () => {
  it('a matching Google listing without website + open data without website ⇒ absence confirmed', async () => {
    const { id } = await persistCluster([place])
    expect(await status(id)).toBe('NO_WEBSITE_KNOWN')
    stubPlaces([{ id: 'gp_1', displayName: { text: 'Salon Lumière' }, location: { latitude: 49.44312, longitude: 1.09931 }, nationalPhoneNumber: '02 35 11 11 11' }])
    const r = await enrichBusiness(id)
    expect(r.google).toBe('no_website')
    expect(await status(id)).toBe('NO_WEBSITE_CONFIRMED')
    const [src] = await sql()<{ raw: object }[]>`select raw from business_sources where business_id = ${id} and source = 'google_places'`
    expect(src!.raw).toEqual({}) // ToS: nothing but the place_id is kept
    const [u] = await sql()<{ provider: string; units: number }[]>`select provider, units from api_usage`
    expect(u).toMatchObject({ provider: 'google_places', units: 1 })
  })
  it('a website found on Google is recorded and the prospect is no longer "without website"', async () => {
    const { id } = await persistCluster([place])
    stubPlaces([{ id: 'gp_2', displayName: { text: 'TEST Salon Lumière' }, location: { latitude: 49.4431, longitude: 1.0993 }, nationalPhoneNumber: '02 35 11 11 11', websiteUri: 'https://salon-lumiere.invalid/' }])
    await enrichBusiness(id)
    expect(['WEBSITE_FOUND', 'WEBSITE_BROKEN']).toContain(await status(id))
  })
  it('an unrelated Google result is not evidence', async () => {
    const { id } = await persistCluster([place])
    stubPlaces([{ id: 'gp_3', displayName: { text: 'Boulangerie Dupont' }, location: { latitude: 49.45, longitude: 1.11 } }])
    const r = await enrichBusiness(id)
    expect(r.google).toMatch(/non trouvé/)
    expect(await status(id)).toBe('NO_WEBSITE_KNOWN')
  })
  it('enrichment without any key never confirms absence on its own', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY
    resetEnvCache()
    const { id } = await persistCluster([place])
    await enrichBusiness(id)
    expect(await status(id)).toBe('NO_WEBSITE_KNOWN')
  })
})
