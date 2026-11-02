import { describe, expect, it } from 'vitest'
import { buildDeterministicConfig, enforceFacts } from '@/lib/site/build'
import { findForbiddenClaim, siteConfigSchema } from '@/lib/site/schema'
import { TEMPLATES } from '@/lib/site/templates'
import type { BusinessFacts } from '@/lib/site/facts'
import { mergeAiContent, type AiSiteContent } from '@/server/sites/ai-content'
import { renderSiteDocument } from '@/server/sites/html'
import { osmHoursToLines } from '@/server/sites/facts'

const facts: BusinessFacts = {
  businessId: 'b1', name: 'Salon Erika', sector: 'hair_salon', sectorLabel: 'Coiffeur', templateId: 'coiffeur', city: 'Rouen', address: '12 rue Jeanne d’Arc', postcode: '76000',
  phoneE164: '+33235710211', phoneDisplay: '02 35 71 02 11', email: 'contact@salon-erika.fr', emailStatus: 'SOURCE_CONFIRMED', lat: 49.44, lon: 1.09, socials: [], openingHours: null,
  websiteStatus: 'NO_WEBSITE_KNOWN', websiteUrl: null, auditFindings: [],
}
const disclaimer = 'Démonstration indépendante.'

describe('site generation (deterministic)', () => {
  it('every template produces a schema-valid config', () => {
    for (const t of TEMPLATES) {
      const cfg = buildDeterministicConfig({ ...facts, templateId: t.id }, { templateId: t.id, disclaimer })
      expect(siteConfigSchema.safeParse(cfg).success).toBe(true)
      expect(cfg.layout).toBe(t.layout)
    }
  })
  it('templates are structurally diverse (≥ 7 layouts, distinct palettes)', () => {
    expect(new Set(TEMPLATES.map((t) => t.layout)).size).toBeGreaterThanOrEqual(7)
    expect(new Set(TEMPLATES.map((t) => t.theme.primary)).size).toBe(TEMPLATES.length)
  })
  it('never invents hours, and template copy contains no fabricated claims', () => {
    const cfg = buildDeterministicConfig(facts, { disclaimer })
    expect(cfg.sections.find((s) => s.type === 'hours')).toBeUndefined()
    for (const t of TEMPLATES) {
      const c = buildDeterministicConfig({ ...facts, templateId: t.id }, { templateId: t.id, disclaimer })
      const texts = [c.hero.eyebrow, c.hero.subtitle, ...c.sections.flatMap((s) => [s.title, s.intro, 'body' in s ? s.body : '', ...('items' in s ? s.items.map((i) => ('q' in i ? `${i.q} ${i.a}` : `${i.title} ${i.description}`)) : [])])]
      for (const t2 of texts) expect(findForbiddenClaim(t2), t2).toBeNull()
    }
  })
  it('uses tel: CTA when a phone is known, otherwise mailto/contact', () => {
    expect(buildDeterministicConfig(facts, { disclaimer }).hero.primaryCta?.href).toBe('tel:+33235710211')
    expect(buildDeterministicConfig({ ...facts, phoneE164: null, phoneDisplay: null }, { disclaimer }).hero.primaryCta?.href).toBe('mailto:contact@salon-erika.fr')
  })
  it('detects fabricated claims', () => {
    expect(findForbiddenClaim('Plus de 20 ans d’expérience')).not.toBeNull()
    expect(findForbiddenClaim('Note 4,9 étoiles sur Google')).not.toBeNull()
    expect(findForbiddenClaim('Coupe à partir de 25 €')).not.toBeNull()
    expect(findForbiddenClaim('Artisan certifié RGE')).not.toBeNull()
    expect(findForbiddenClaim('Un salon chaleureux au cœur de Rouen')).toBeNull()
  })
})

describe('AI merge guard', () => {
  const skeleton = buildDeterministicConfig(facts, { disclaimer })
  const ai: AiSiteContent = {
    style: 'premium',
    palette: { primary: '#5b2a86', accent: '#e0a458', background: '#ffffff', surface: '#f7f3fa', text: '#1c1324', muted: '#6b5e75' },
    fontPairIndex: 0,
    hero: { eyebrow: 'Coiffure à Rouen', title: 'IGNORED', subtitle: 'Depuis 1998, plus de 5000 clients satisfaits', primaryCtaLabel: 'Réserver' },
    about: { title: 'Le salon', body: 'Un lieu chaleureux pour prendre soin de vous.' },
    services: [{ title: 'Coupe', description: 'Coupe femme et homme.', icon: 'scissors' }, { title: 'Couleur', description: 'Dès 45 €', icon: 'brush' }, { title: 'Soins', description: 'Soins profonds.', icon: 'sparkles' }],
    benefits: [],
    faq: [{ q: 'Faut-il réserver ?', a: 'Appelez-nous.' }],
    seo: { title: 'Salon Erika – Coiffeur à Rouen', description: 'Coiffeur à Rouen.' },
  }
  it('rejects fabricated fields, keeps the business name and contact facts', () => {
    const { config, report } = mergeAiContent(skeleton, ai, null)
    expect(config.hero.title).toBe('Salon Erika')
    expect(config.hero.subtitle).toBe(skeleton.hero.subtitle)
    expect(report.rejected.map((r) => r.field)).toContain('hero.subtitle')
    const services = config.sections.find((s) => s.type === 'services')
    expect(services && 'items' in services ? services.items.map((i) => i.title) : []).toEqual(['Coupe', 'Soins'])
    expect(config.theme.primary).toBe('#5b2a86')
    expect(siteConfigSchema.safeParse(config).success).toBe(true)
  })
  it('rejects unreadable palettes', () => {
    const { config, report } = mergeAiContent(skeleton, { ...ai, palette: { ...ai.palette, text: '#ffffff' } }, null)
    expect(config.theme.text).toBe(skeleton.theme.text)
    expect(report.rejected.some((r) => r.field === 'palette')).toBe(true)
  })
  it('enforceFacts overwrites any contact data with verified facts', () => {
    const tampered = { ...skeleton, business: { ...skeleton.business, phone: '01 00 00 00 00', email: 'evil@x.com' } }
    const fixed = enforceFacts(tampered, facts)
    expect(fixed.business.email).toBe('contact@salon-erika.fr')
    expect(fixed.business.phone).toBe('02 35 71 02 11')
  })
})

describe('rendering', () => {
  it('escapes untrusted text (XSS) and marks previews noindex', () => {
    const cfg = buildDeterministicConfig({ ...facts, name: '<script>alert(1)</script>Salon' }, { disclaimer })
    const html = renderSiteDocument(cfg, { mode: 'preview', banner: 'Démo' })
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('noindex')
    expect(html).toContain('Démo')
  })
  it('exports with an external stylesheet and without noindex', () => {
    const html = renderSiteDocument(buildDeterministicConfig(facts, { disclaimer }), { mode: 'export', cssHref: 'site.css' })
    expect(html).toContain('href="site.css"')
    expect(html).toContain('index,follow')
  })
  it('rejects javascript: links in the schema', () => {
    const cfg = buildDeterministicConfig(facts, { disclaimer })
    const bad = { ...cfg, hero: { ...cfg.hero, primaryCta: { label: 'x', href: 'javascript:alert(1)' } } }
    expect(siteConfigSchema.safeParse(bad).success).toBe(false)
  })
  it('converts simple OSM opening hours, refuses complex ones', () => {
    expect(osmHoursToLines('Tu-Fr 09:00-19:00; Sa 09:00-17:00')).toEqual(['Mardi – Vendredi : 09:00 – 19:00', 'Samedi : 09:00 – 17:00'])
    expect(osmHoursToLines('Mo-Fr 08:00-12:00 "sur rendez-vous"')).toBeNull()
  })
})
