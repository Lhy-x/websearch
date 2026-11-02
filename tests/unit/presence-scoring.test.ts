import { describe, expect, it } from 'vitest'
import { classifyPresence } from '@/server/enrich/presence'
import { computeScore, type ScoreInput } from '@/server/scoring/score'
import { scoringWeightsSchema } from '@/server/core/settings'

const now = new Date('2026-11-02T10:00:00Z')
const W = scoringWeightsSchema.parse({})

describe('web presence', () => {
  it('a single empty source is NOT a confirmed absence', () => {
    expect(classifyPresence({ ownWebsite: null, evidence: [{ source: 'overture', at: '', finding: 'no_website' }], audit: null })).toBe('NO_WEBSITE_KNOWN')
  })
  it('two independent sources without a live check stay NO_WEBSITE_KNOWN', () => {
    expect(classifyPresence({ ownWebsite: null, evidence: [{ source: 'overture', at: '', finding: 'no_website' }, { source: 'osm', at: '', finding: 'third_party_only' }], audit: null })).toBe('NO_WEBSITE_KNOWN')
  })
  it('two sources including a live check confirm the absence', () => {
    expect(classifyPresence({ ownWebsite: null, evidence: [{ source: 'overture', at: '', finding: 'no_website' }, { source: 'google_places', at: '', finding: 'no_website', live: true }], audit: null })).toBe('NO_WEBSITE_CONFIRMED')
  })
  it('Sirene silence does not count (it publishes no websites)', () => {
    expect(classifyPresence({ ownWebsite: null, evidence: [{ source: 'recherche_entreprises', at: '', finding: 'no_website', live: true }], audit: null })).toBe('UNVERIFIED')
  })
  it('manual confirmation wins', () => {
    expect(classifyPresence({ ownWebsite: null, evidence: [{ source: 'manual', at: '', finding: 'manual_no_website' }], audit: null })).toBe('NO_WEBSITE_CONFIRMED')
  })
  it('classifies audited websites', () => {
    const a = { reachable: true, httpStatus: 200, qualityScore: 90, hasViewport: true, httpsOk: true, copyrightYear: 2026 }
    expect(classifyPresence({ ownWebsite: 'https://x.fr', evidence: [], audit: a, now })).toBe('WEBSITE_GOOD')
    expect(classifyPresence({ ownWebsite: 'https://x.fr', evidence: [], audit: { ...a, reachable: false, httpStatus: null }, now })).toBe('WEBSITE_BROKEN')
    expect(classifyPresence({ ownWebsite: 'https://x.fr', evidence: [], audit: { ...a, hasViewport: false }, now })).toBe('WEBSITE_OUTDATED')
    expect(classifyPresence({ ownWebsite: 'https://x.fr', evidence: [], audit: { ...a, qualityScore: 30 }, now })).toBe('WEBSITE_LOW_QUALITY')
    expect(classifyPresence({ ownWebsite: 'https://x.fr', evidence: [], audit: null })).toBe('WEBSITE_FOUND')
  })
})

describe('scoring', () => {
  const input: ScoreInput = { presence: 'NO_WEBSITE_CONFIRMED', sector: 'hair_salon', emailStatus: 'SOURCE_CONFIRMED', hasPhone: true, hasAddress: true, hasCoordinates: true, sourceCount: 2, avgSourceConfidence: 0.9, operatingStatus: 'open', pipelineStatus: 'DISCOVERED', doNotContact: false, explicitNeed: false, hasSiret: true }
  it('is deterministic and explains itself', () => {
    const a = computeScore(input, W)
    expect(computeScore(input, W)).toEqual(a)
    expect(a.score).toBeGreaterThanOrEqual(75)
    expect(a.priority).toBe('A')
    expect(a.reasons.some((r) => r.label.includes('vérification multi-source'))).toBe(true)
  })
  it('ranks a confirmed absence above a good existing website', () => {
    expect(computeScore(input, W).score).toBeGreaterThan(computeScore({ ...input, presence: 'WEBSITE_GOOD' }, W).score)
  })
  it('responds to weights', () => {
    const noEmailWeight = computeScore({ ...input, emailStatus: 'NONE' }, W).score
    expect(noEmailWeight).toBeLessThan(computeScore(input, W).score)
    expect(computeScore(input, { ...W, emailAvailable: 0 }).score).not.toBe(computeScore(input, W).score)
  })
  it('opposition forces score 0', () => {
    expect(computeScore({ ...input, doNotContact: true }, W).score).toBe(0)
  })
  it('penalises closed businesses and already-contacted prospects', () => {
    expect(computeScore({ ...input, operatingStatus: 'permanently_closed' }, W).score).toBeLessThan(computeScore(input, W).score)
    expect(computeScore({ ...input, pipelineStatus: 'CONTACTED' }, W).score).toBeLessThan(computeScore(input, W).score)
  })
})
