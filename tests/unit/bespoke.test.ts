import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sanitizeSiteHtml } from '@/server/sites/bespoke/sanitize'
import { checkAgainstFacts, visibleText } from '@/server/sites/bespoke/checks'
import { renderBespokeDocument } from '@/server/sites/bespoke/document'
import { strictSchema, extractJson } from '@/server/ai/cli'
import type { BusinessFacts } from '@/lib/site/facts'

const raw = readFileSync('tests/fixtures/bespoke-site.html', 'utf8')
const facts: BusinessFacts = {
  businessId: 'b', name: 'TEST Salon Lumière', sector: 'hair_salon', sectorLabel: 'Coiffeur', templateId: 'coiffeur', city: 'Rouen', address: '3 rue Test', postcode: '76000',
  phoneE164: '+33235111111', phoneDisplay: '02 35 11 11 11', email: 'contact@salon-lumiere.test', emailStatus: 'SOURCE_CONFIRMED', lat: 49.4431, lon: 1.0993, socials: [], openingHours: null,
  websiteStatus: 'NO_WEBSITE_KNOWN', websiteUrl: null, auditFindings: [], creationYear: 2012,
}

describe('bespoke HTML sanitizer', () => {
  const { html, removed } = sanitizeSiteHtml(raw)
  it('removes every script vector', () => {
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/onclick|javascript:/i)
    expect(removed).toEqual(expect.arrayContaining(['<script>', '@onclick']))
  })
  it('removes forms, foreign iframes and non-Google stylesheets/imports, keeps fonts and the OSM map', () => {
    expect(html).not.toMatch(/<form|<input|evil\.example/i)
    expect(html).toContain('https://fonts.googleapis.com/css2?family=Fraunces')
    expect(html).toContain('https://www.openstreetmap.org/export/embed.html')
  })
  it('removes hotlinked "photos" (img and CSS url) unless provided as licensed media', () => {
    expect(html).not.toContain('images.example.com')
    const allowed = sanitizeSiteHtml(raw, ['https://images.example.com/fake-salon.jpg']).html
    expect(allowed).toContain('https://images.example.com/fake-salon.jpg')
  })
  it('keeps tel/mailto links, inline SVG and styles', () => {
    expect(html).toContain('href="tel:+33235111111"')
    expect(html).toContain('mailto:contact@salon-lumiere.test')
    expect(html).toMatch(/<svg[^>]*viewBox/)
    expect(html).toContain('--sage:#7d9a86')
  })
})

describe('fact checks', () => {
  const clean = sanitizeSiteHtml(raw).html
  it('a faithful site has no critical issue', () => {
    expect(checkAgainstFacts(clean, facts).filter((i) => i.severity === 'critical')).toEqual([])
  })
  it('flags invented phones, emails and claims', () => {
    const bad = clean.replace('</footer>', '<p>Appelez le 06 12 34 56 78 ou écrivez à jean@gmail.com. Noté 4,9 étoiles, plus de 20 ans d’expérience.</p></footer>')
    const codes = checkAgainstFacts(bad, facts).filter((i) => i.severity === 'critical').map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['phone_unknown', 'email_unknown', 'claim']))
  })
  it('allows the verified Sirene creation year, not another one', () => {
    expect(checkAgainstFacts(clean.replace('</footer>', '<p>Salon ouvert depuis 2012.</p></footer>'), facts).some((i) => i.code === 'claim')).toBe(false)
    expect(checkAgainstFacts(clean.replace('</footer>', '<p>Salon ouvert depuis 1998.</p></footer>'), facts).some((i) => i.code === 'claim')).toBe(true)
  })
  it('requires exactly one h1 and the business name', () => {
    const issues = checkAgainstFacts(clean.replace(/<h1>.*?<\/h1>/, '<h2>Bienvenue</h2>').replaceAll('TEST Salon Lumière', 'Le salon'), facts).map((i) => i.code)
    expect(issues).toContain('h1')
    expect(issues).toContain('name_missing')
  })
  it('extracts visible text only', () => {
    expect(visibleText(clean)).not.toContain('--sage')
  })
})

describe('final document', () => {
  it('injects noindex + banner + disclaimer for previews, nothing for exports', () => {
    const site = { schemaVersion: 1 as const, kind: 'html' as const, html: sanitizeSiteHtml(raw).html, designPlan: null, businessName: facts.name, media: [], report: null }
    const p = renderBespokeDocument(site, { mode: 'preview', banner: 'Démonstration non officielle', disclaimer: 'Démo indépendante.' })
    expect(p).toContain('noindex')
    expect(p).toContain('Démonstration non officielle')
    expect(p).toContain('Démo indépendante.')
    const e = renderBespokeDocument(site, { mode: 'export' })
    expect(e).toContain('index,follow')
    expect(e).not.toContain('Démonstration non officielle')
  })
})

describe('CLI helpers', () => {
  it('builds strict schemas for Codex structured outputs', () => {
    const s = strictSchema({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'object', properties: { c: { type: 'number' } } } }, required: ['a'] }) as Record<string, any>
    expect(s.required).toEqual(['a', 'b'])
    expect(s.additionalProperties).toBe(false)
    expect(s.properties.b.additionalProperties).toBe(false)
  })
  it('extracts JSON from fenced or chatty answers', () => {
    expect(extractJson('Voici :\n```json\n{"ok":true}\n```')).toEqual({ ok: true })
    expect(extractJson('blabla {"ok":1} fin')).toEqual({ ok: 1 })
  })
})
