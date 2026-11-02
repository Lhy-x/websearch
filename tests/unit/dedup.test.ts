import { describe, expect, it } from 'vitest'
import { clusterRecords, matchBusinesses, nameSimilarity } from '@/server/search/dedup'

const base = { lat: 49.44, lon: 1.1, phones: [] as string[], websites: [] as string[] }

describe('deduplication', () => {
  it('ignores generic sector words and the city when comparing names', () => {
    expect(nameSimilarity('Le Salon Rouen', 'Le Studio Rouen', new Set(['rouen']))).toBe(0)
    expect(nameSimilarity('Coiffure Erika', 'Erika Coiffure')).toBe(1)
  })
  it('merges same phone + similar name nearby', () => {
    const m = matchBusinesses({ ...base, name: 'Coiffure Erika', phones: ['+33235710211'] }, { ...base, name: 'Erika Coiffure La Suite', lat: 49.4401, phones: ['02 35 71 02 11'] })
    expect(m.decision).toBe('MERGE')
  })
  it('merges identical SIRET regardless of names', () => {
    expect(matchBusinesses({ ...base, name: 'A', siret: '12345678900011' }, { ...base, name: 'B', siret: '12345678900011' }).decision).toBe('MERGE')
  })
  it('keeps chain branches far apart distinct even with the same domain', () => {
    const m = matchBusinesses({ ...base, name: 'Tchip Coiffure', websites: ['https://tchip.fr/a'] }, { ...base, name: 'Tchip Coiffure', lat: 49.48, websites: ['https://tchip.fr/b'] })
    expect(m.decision).toBe('DISTINCT')
  })
  it('flags ambiguous pairs for review instead of merging (same phone, different names)', () => {
    const m = matchBusinesses({ ...base, name: 'Coiffure Evolution', phones: ['+33235000000'] }, { ...base, name: 'Salon Des Rotours', phones: ['+33235000000'] })
    expect(m.decision).toBe('REVIEW')
  })
  it('different SIRETs are never auto-merged', () => {
    const m = matchBusinesses({ ...base, name: 'Boulangerie Martin', siret: '11111111100011' }, { ...base, name: 'Boulangerie Martin', siret: '22222222200022' })
    expect(m.decision).not.toBe('MERGE')
  })
  it('clusters transitive MERGE links only', () => {
    const recs = [
      { ...base, name: 'Barber Max', phones: ['+33611111111'] },
      { ...base, name: 'Max Barber', lat: 49.4401, phones: ['06 11 11 11 11'] },
      { ...base, name: 'Boulangerie Dupont', lat: 49.45 },
    ]
    const { clusters } = clusterRecords(recs)
    expect(clusters.map((c) => c.length).sort()).toEqual([1, 2])
  })
})
