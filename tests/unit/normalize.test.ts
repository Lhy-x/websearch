import { describe, expect, it } from 'vitest'
import { domainOf, isThirdPartyHost, normalizeEmail, normalizeName, normalizePhone, normalizeUrl } from '@/server/core/normalize'
import { bboxAround, haversineKm } from '@/server/core/geo'

describe('normalisation', () => {
  it('normalises names (accents, legal forms, punctuation)', () => {
    expect(normalizeName("L'Atelier Coiffure SARL")).toBe('l atelier coiffure')
    expect(normalizeName('Café & Co.')).toBe('cafe et co')
  })
  it('parses Overture phones missing the + prefix', () => {
    expect(normalizePhone('33629536828')).toBe('+33629536828')
    expect(normalizePhone('+33 6 24 29 89 03')).toBe('+33624298903')
    expect(normalizePhone('02 35 71 02 11')).toBe('+33235710211')
    expect(normalizePhone('12')).toBeNull()
  })
  it('validates emails and rejects assets/garbage', () => {
    expect(normalizeEmail(' Contact@Salon.FR ')).toBe('contact@salon.fr')
    expect(normalizeEmail('mailto:a@b.fr?subject=x')).toBe('a@b.fr')
    expect(normalizeEmail('logo@2x.png')).toBeNull()
    expect(normalizeEmail('not-an-email')).toBeNull()
  })
  it('detects third-party hosts (booking platforms, social networks)', () => {
    expect(isThirdPartyHost('https://www.planity.com/la-loge-76380')).toBe(true)
    expect(isThirdPartyHost('https://m.facebook.com/salon')).toBe(true)
    expect(isThirdPartyHost('https://www.salon-erika.fr')).toBe(false)
    expect(domainOf('http://www.Salon-Erika.fr/contact')).toBe('salon-erika.fr')
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
  })
  it('computes distances and bounding boxes', () => {
    expect(haversineKm(49.4431, 1.0993, 48.8566, 2.3522)).toBeGreaterThan(110)
    expect(haversineKm(49.4431, 1.0993, 48.8566, 2.3522)).toBeLessThan(115)
    const bb = bboxAround(49.4431, 1.0993, 10)
    expect(haversineKm(49.4431, 1.0993, bb.ymax, 1.0993)).toBeCloseTo(10, 0)
  })
})
