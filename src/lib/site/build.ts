import type { BusinessFacts } from './facts'
import { siteConfigSchema, type Section, type SiteConfig, type SiteStyle } from './schema'
import { templateForSector, type TemplateDef, type TemplateFacts } from './templates'
import { applyStyle } from './themes'

export function telHref(e164: string | null): string | null {
  return e164 ? `tel:${e164.replace(/[^+\d]/g, '')}` : null
}

export function primaryCta(t: TemplateDef, f: BusinessFacts) {
  const tel = telHref(f.phoneE164)
  if (tel) return { label: t.primaryCtaLabel, href: tel }
  if (f.email) return { label: t.primaryCtaLabel, href: `mailto:${f.email}` }
  return { label: 'Nous trouver', href: '#contact' }
}

const NAV_LABELS: Record<Section['type'], string> = {
  about: 'À propos', services: 'Prestations', benefits: 'Atouts', process: 'Méthode', gallery: 'Galerie', hours: 'Horaires', area: 'Accès', faq: 'FAQ', cta: '', contact: 'Contact',
}

/**
 * Deterministic site generation from verified facts + template copy library.
 * Used when no AI provider is configured (or in LOW_COST mode) and as the skeleton the AI fills.
 */
export function buildDeterministicConfig(f: BusinessFacts, opts: { templateId?: string; style?: SiteStyle; disclaimer: string; language?: SiteConfig['language'] }): SiteConfig {
  const t = templateForSector(opts.templateId ?? f.templateId)
  const style = opts.style ?? t.defaultStyle
  const tf: TemplateFacts = { name: f.name, city: f.city, sectorLabel: f.sectorLabel, hasPhone: !!f.phoneE164, hasEmail: !!f.email }
  const sections: Section[] = []
  for (const type of t.sectionOrder) {
    switch (type) {
      case 'about': {
        const a = t.about(tf)
        sections.push({ id: 'about', type, enabled: true, title: a.title, intro: '', body: a.body })
        break
      }
      case 'services':
        sections.push({ id: 'services', type, enabled: true, title: t.servicesTitle, intro: '', items: t.services.map((s) => ({ ...s, indicative: true })), note: 'Liste indicative — à compléter avec l’établissement.' })
        break
      case 'benefits':
        if (t.benefits.length) sections.push({ id: 'benefits', type, enabled: true, title: t.benefitsTitle, intro: '', items: t.benefits })
        break
      case 'process':
        if (t.process?.length) sections.push({ id: 'process', type, enabled: true, title: 'Comment ça se passe', intro: '', items: t.process })
        break
      case 'gallery':
        // only enabled when authorised media exist (added from the editor)
        sections.push({ id: 'gallery', type, enabled: false, title: 'Galerie', intro: '', mediaIds: [] })
        break
      case 'hours':
        if (f.openingHours?.lines.length) sections.push({ id: 'hours', type, enabled: true, title: 'Horaires', intro: '', lines: f.openingHours.lines, source: f.openingHours.source })
        break
      case 'area':
        sections.push({ id: 'area', type, enabled: !!f.city, title: 'Zone & accès', intro: '', body: t.areaBody(tf), places: [] })
        break
      case 'faq':
        sections.push({ id: 'faq', type, enabled: true, title: 'Questions fréquentes', intro: '', items: t.faq(tf) })
        break
      case 'cta': {
        const cta = primaryCta(t, f)
        sections.push({ id: 'cta', type, enabled: true, title: 'Parlons de votre besoin', intro: '', body: f.phoneE164 ? `Appelez-nous au ${f.phoneDisplay}.` : 'Contactez-nous, nous vous répondrons rapidement.', cta })
        break
      }
      case 'contact':
        sections.push({ id: 'contact', type, enabled: true, title: 'Contact', intro: '' })
        break
    }
  }
  const hero = t.hero(tf)
  const cta = primaryCta(t, f)
  const config: SiteConfig = {
    schemaVersion: 1,
    templateId: t.id,
    layout: t.layout,
    style,
    language: opts.language ?? 'fr',
    business: {
      name: f.name,
      sectorLabel: f.sectorLabel,
      city: f.city,
      address: f.address,
      postcode: f.postcode,
      phone: f.phoneDisplay,
      phoneE164: f.phoneE164,
      email: f.email,
      lat: f.lat,
      lon: f.lon,
      socials: f.socials.slice(0, 6),
    },
    theme: applyStyle(t.theme, style),
    navigation: [],
    hero: { ...hero, primaryCta: cta, secondaryCta: cta.href === '#contact' ? null : { label: 'Contact', href: '#contact' }, mediaId: null },
    sections,
    media: [],
    seo: {
      title: `${f.name}${f.city ? ' – ' + f.sectorLabel + ' à ' + f.city : ''}`.slice(0, 70),
      description: `${f.name}, ${f.sectorLabel.toLowerCase()}${f.city ? ' à ' + f.city : ''}. Coordonnées, prestations et accès.`.slice(0, 170),
    },
    disclaimer: opts.disclaimer,
  }
  config.navigation = buildNavigation(config.sections)
  return siteConfigSchema.parse(config)
}

export function buildNavigation(sections: Section[]): SiteConfig['navigation'] {
  return sections
    .filter((s) => s.enabled && NAV_LABELS[s.type])
    .slice(0, 6)
    .map((s) => ({ label: NAV_LABELS[s.type], target: `#${s.id}` }))
}

/** Contact data always comes from verified facts, never from AI output. */
export function enforceFacts(config: SiteConfig, f: BusinessFacts): SiteConfig {
  return {
    ...config,
    business: { ...config.business, name: f.name, city: f.city, address: f.address, postcode: f.postcode, phone: f.phoneDisplay, phoneE164: f.phoneE164, email: f.email, lat: f.lat, lon: f.lon, socials: f.socials.slice(0, 6) },
    sections: config.sections.map((s) => (s.type === 'hours' ? (f.openingHours ? { ...s, lines: f.openingHours.lines, source: f.openingHours.source } : { ...s, enabled: false, lines: [] }) : s)),
  }
}
