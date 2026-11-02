import { describe, expect, it } from 'vitest'
import { detectCity, detectSector, parseCommand } from '@/server/assistant/rules'

describe('assistant deterministic parser', () => {
  it('« Recherche les entreprises de nettoyage à Rouen sans site confirmé. »', () => {
    expect(parseCommand('Recherche les entreprises de nettoyage à Rouen sans site confirmé.')).toEqual([
      { tool: 'search_prospects', input: { city: 'Rouen', sector: 'cleaning', radiusKm: 10, websiteFilter: 'no_website_confirmed', keywords: undefined } },
    ])
  })
  it('« Génère une démonstration pour les cinq prospects les mieux qualifiés. »', () => {
    const [c] = parseCommand('Génère une démonstration pour les cinq prospects les mieux qualifiés.')
    expect(c).toMatchObject({ tool: 'generate_sites', input: { top: 5 } })
  })
  it('« Prépare une campagne pour ces prospects. » uses the UI selection', () => {
    const ids = ['3f0c6f0a-0000-4000-8000-000000000001']
    expect(parseCommand('Prépare une campagne pour ces prospects.', ids)).toEqual([{ tool: 'prepare_campaign', input: { businessIds: ids } }])
  })
  it('campaign ranking and attention queue', () => {
    expect(parseCommand('Montre-moi les campagnes ayant le meilleur taux de réponse.')[0]!.tool).toBe('campaign_performance')
    expect(parseCommand('Quelles conversations nécessitent mon attention ?')[0]!.tool).toBe('conversations_needing_attention')
  })
  it('extracts cities, radius and sectors', () => {
    expect(detectCity('cherche les plombiers à Saint-Étienne dans 20 km')).toBe('Saint-Étienne')
    expect(detectCity('les garages autour de Aix-en-Provence sans site')).toBe('Aix-en-Provence')
    expect(detectSector('les barbiers')).toBe('barber')
    expect(detectSector('salons de coiffure')).toBe('hair_salon')
    expect(parseCommand('trouve les électriciens à Lyon dans un rayon de 25 km')[0]).toMatchObject({ tool: 'search_prospects', input: { city: 'Lyon', sector: 'electrician', radiusKm: 25 } })
  })
  it('returns nothing (instead of guessing) for unrelated requests', () => {
    expect(parseCommand('Quel temps fait-il demain ?')).toEqual([])
    expect(parseCommand('Envoie tous les emails maintenant')).toEqual([])
  })
})
