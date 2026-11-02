import { describe, expect, it } from 'vitest'
import { assertSafeUrl, isPrivateIp } from '@/server/core/safe-fetch'
import { scoreAudit, type AuditFacts } from '@/server/enrich/audit'
import { extractEmails, extractPage } from '@/server/enrich/html-extract'
import { mapImportRows, guessMapping } from '@/server/connectors/import'
import { mapOvertureRow, acceptedSectors, matchesKeywords } from '@/server/connectors/overture'
import { hashPassword, verifyPassword, encryptSecret, decryptSecret } from '@/server/core/crypto'
import { signSession, verifySession } from '@/lib/session'
import { mapCompany } from '@/server/connectors/recherche-entreprises'

describe('SSRF protection', () => {
  it('blocks private and internal targets', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '100.64.1.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) expect(isPrivateIp(ip)).toBe(true)
    expect(isPrivateIp('93.184.216.34')).toBe(false)
    expect(() => assertSafeUrl('http://localhost:5432')).toThrow()
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow()
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow()
    expect(() => assertSafeUrl('http://user:pw@example.com')).toThrow()
    expect(() => assertSafeUrl('https://example.com:6379')).toThrow()
    expect(assertSafeUrl('https://www.salon-erika.fr/contact').hostname).toBe('www.salon-erika.fr')
  })
})

describe('HTML extraction & audit scoring', () => {
  it('extracts emails (incl. obfuscated), CTA, viewport, copyright', () => {
    const html = `<html><head><title>Salon</title><meta name="viewport" content="width=device-width"></head><body><h1>Salon</h1><a href="mailto:contact@salon.fr">Écrire</a><p>rdv [at] salon [dot] fr</p><a href="tel:+33235000000">Appeler</a><a href="https://facebook.com/salon">fb</a><footer>© 2019 Salon</footer></body></html>`
    const ex = extractPage(html, 'https://salon.fr/')
    expect(ex.emails.sort()).toEqual(['contact@salon.fr', 'rdv@salon.fr'])
    expect(ex.hasCta).toBe(true)
    expect(ex.hasViewport).toBe(true)
    expect(ex.copyrightYear).toBe(2019)
    expect(ex.socials).toEqual(['https://facebook.com/salon'])
    expect(extractEmails('img@2x.png foo')).toEqual([])
  })
  it('scores audits from facts', () => {
    const good: AuditFacts = { httpStatus: 200, httpsOk: true, loadMs: 900, hasViewport: true, mobileOverflow: false, title: 'x', metaDescription: 'y', h1Count: 1, formsCount: 0, hasCta: true, hasContactInfo: true, brokenLinks: [], consoleErrors: [], copyrightYear: 2026, error: null }
    expect(scoreAudit(good, new Date('2026-11-01')).score).toBe(100)
    const bad = scoreAudit({ ...good, httpsOk: false, hasViewport: false, hasCta: false }, new Date('2026-11-01'))
    expect(bad.score).toBeLessThan(50)
    expect(bad.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['no_https', 'no_viewport', 'no_cta']))
    expect(scoreAudit({ ...good, error: 'net::ERR_NAME_NOT_RESOLVED', httpStatus: null }).score).toBe(0)
  })
})

describe('import validation', () => {
  it('maps columns and reports errors line by line', () => {
    const rows = [
      { Nom: 'Salon A', Ville: 'Rouen', Tel: '02 35 00 00 00', Email: 'a@a.fr' },
      { Nom: '', Ville: 'Rouen', Tel: '', Email: '' },
      { Nom: 'Salon C', Ville: 'Rouen', Tel: 'abc', Email: 'pas-un-email' },
    ]
    const mapping = guessMapping(Object.keys(rows[0]!))
    expect(mapping).toMatchObject({ name: 'Nom', city: 'Ville', phone: 'Tel', email: 'Email' })
    const r = mapImportRows(rows, mapping, { country: 'FR' })
    expect(r.places).toHaveLength(1)
    expect(r.places[0]!.phones).toEqual(['+33235000000'])
    expect(r.errors.map((e) => e.line)).toEqual([3, 4])
    expect(r.errors[1]!.errors.join(' ')).toMatch(/email invalide/)
  })
})

describe('connectors (pure mapping)', () => {
  it('maps an Overture row and its sector', () => {
    const p = mapOvertureRow({ id: 'x', names: { primary: 'Barber Shop 76' }, taxonomy: { primary: 'hair_salon', hierarchy: ['lifestyle_services', 'personal_or_beauty_service', 'hair_salon'] }, bbox: { xmin: 1, xmax: 1, ymin: 49, ymax: 49 }, phones: ['33629536828'], addresses: [{ freeform: '1 rue X', locality: 'Rouen', postcode: '76000', country: 'FR' }], sources: [{ dataset: 'meta', license: 'CDLA-Permissive-2.0' }] }, '2026-10-21.0')
    expect(p?.sector).toBe('barber')
    expect(p?.city).toBe('Rouen')
    expect(acceptedSectors('hair_salon')?.has('barber')).toBe(true)
    expect(matchesKeywords('Coiffure Élégance', 'hair_salon', 'elegance')).toBe(true)
  })
  it('maps Sirene (recherche-entreprises) establishments within radius, active only', () => {
    const out = mapCompany({ siren: '123456789', nom_complet: 'SALON MARTIN', activite_principale: '96.02A', matching_etablissements: [
      { siret: '12345678900011', etat_administratif: 'A', latitude: '49.443', longitude: '1.099', adresse: '1 RUE X 76000 ROUEN', code_postal: '76000', libelle_commune: 'ROUEN', activite_principale: '96.02A' },
      { siret: '12345678900029', etat_administratif: 'F', latitude: '49.443', longitude: '1.099' },
      { siret: '12345678900037', etat_administratif: 'A', latitude: '45.0', longitude: '5.0' },
    ] }, { lat: 49.4431, lon: 1.0993, radiusKm: 10 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ siret: '12345678900011', sector: 'hair_salon', name: 'Salon Martin' })
  })
})

describe('auth & secrets', () => {
  it('hashes passwords with scrypt', async () => {
    const h = await hashPassword('correct horse battery')
    expect(await verifyPassword('correct horse battery', h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
    expect(h).not.toContain('$')
  })
  it('encrypts secrets (AES-GCM) and detects tampering', () => {
    const blob = encryptSecret('sk-test-123')
    expect(blob).not.toContain('sk-test')
    expect(decryptSecret(blob)).toBe('sk-test-123')
    const parts = blob.split(':')
    parts[3] = Buffer.from('tampered').toString('base64')
    expect(() => decryptSecret(parts.join(':'))).toThrow()
  })
  it('session tokens are bound to the configured admin', async () => {
    const t = await signSession('admin@test.local')
    expect(await verifySession(t)).toEqual({ email: 'admin@test.local' })
    expect(await verifySession(await signSession('intruder@x.com'))).toBeNull()
    expect(await verifySession(t.slice(0, -2) + 'xx')).toBeNull()
    expect(await verifySession(undefined)).toBeNull()
  })
})
