import { z } from 'zod'
import { ICONS, findForbiddenClaim, type SiteConfig, type SiteStyle } from '@/lib/site/schema'
import { FONT_PAIRS, contrastRatio } from '@/lib/site/themes'
import { buildNavigation } from '@/lib/site/build'
import type { BusinessFacts } from '@/lib/site/facts'

/** What the AI is allowed to produce: copy + design choices. Contact data and structure stay ours. */
export const aiSiteContentSchema = z.object({
  style: z.enum(['minimaliste', 'premium', 'moderne', 'editorial', 'institutionnel', 'creatif', 'artisanal', 'elegant', 'haut_de_gamme']),
  palette: z.object({ primary: z.string(), accent: z.string(), background: z.string(), surface: z.string(), text: z.string(), muted: z.string() }),
  fontPairIndex: z.number().int(),
  hero: z.object({ eyebrow: z.string(), title: z.string(), subtitle: z.string(), primaryCtaLabel: z.string() }),
  about: z.object({ title: z.string(), body: z.string() }),
  services: z.array(z.object({ title: z.string(), description: z.string(), icon: z.enum(ICONS) })),
  benefits: z.array(z.object({ title: z.string(), description: z.string(), icon: z.enum(ICONS) })),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  seo: z.object({ title: z.string(), description: z.string() }),
})
export type AiSiteContent = z.infer<typeof aiSiteContentSchema>

export const SITE_SYSTEM_PROMPT = `Tu es un rédacteur web et directeur artistique pour des sites vitrines de commerces locaux francophones.
Tu produis le contenu d'une DÉMONSTRATION de site, à partir uniquement des faits fournis.
Règles impératives :
- N'invente jamais : avis, notes, témoignages, nombre d'années d'expérience, dates de création, tarifs, prix, certifications, labels, récompenses, réalisations, nombre de clients, garanties chiffrées, noms de personnes.
- Les prestations doivent être génériques et typiques du secteur ; elles seront validées par l'établissement.
- Pas de superlatifs invérifiables (« le meilleur », « n°1 », « leader »).
- Ton naturel, concret, phrases courtes, français correct. Pas d'emoji.
- Les couleurs sont des hex #rrggbb ; le texte doit être lisible sur le fond (contraste élevé).`

export function buildSiteInstructions(f: BusinessFacts, skeleton: SiteConfig, forcedStyle: SiteStyle | null, custom: string): string {
  return `Génère le contenu du site de démonstration pour cet établissement.
Template : ${skeleton.templateId} (structure ${skeleton.layout}). Style ${forcedStyle ? `IMPOSÉ : ${forcedStyle}` : `suggéré : ${skeleton.style} (tu peux en choisir un autre plus adapté)`}.
Palette de départ du template : ${JSON.stringify({ primary: skeleton.theme.primary, accent: skeleton.theme.accent, background: skeleton.theme.background, text: skeleton.theme.text })}.
Paires de polices disponibles (fontPairIndex) : ${FONT_PAIRS.map((p, i) => `${i}=${p.heading}/${p.body}`).join(', ')}.
Contraintes : 3 à 6 prestations, 0 à 3 atouts, 2 à 4 questions FAQ (réponses qui renvoient vers le contact sans inventer), titre SEO ≤ 60 caractères, description SEO ≤ 155 caractères.
Faits vérifiés : ${JSON.stringify({ nom: f.name, activite: f.sectorLabel, ville: f.city, telephone_disponible: !!f.phoneE164, email_disponible: !!f.email, horaires_connus: !!f.openingHours })}.
${custom ? `Consignes personnalisées de l'utilisateur : ${custom}` : ''}`
}

const HEX = /^#[0-9a-f]{6}$/i

export interface MergeReport {
  rejected: { field: string; reason: string }[]
}

/**
 * Merge AI copy into the deterministic skeleton. Any field containing a fabricated-claim pattern keeps
 * the deterministic text; unreadable palettes are rejected. Contact data is never taken from the AI.
 */
export function mergeAiContent(skeleton: SiteConfig, ai: AiSiteContent, forcedStyle: SiteStyle | null): { config: SiteConfig; report: MergeReport } {
  const rejected: MergeReport['rejected'] = []
  const ok = (field: string, s: string, max: number): boolean => {
    if (!s.trim()) return false
    const bad = findForbiddenClaim(s)
    if (bad) {
      rejected.push({ field, reason: `affirmation invérifiable « ${bad} »` })
      return false
    }
    if (s.length > max) {
      rejected.push({ field, reason: 'trop long' })
      return false
    }
    return true
  }
  const cfg: SiteConfig = structuredClone(skeleton)
  cfg.style = forcedStyle ?? ai.style
  const pal = ai.palette
  if (Object.values(pal).every((c) => HEX.test(c)) && contrastRatio(pal.text, pal.background) >= 4.5 && contrastRatio(pal.primary, pal.background) >= 2.5) {
    cfg.theme = { ...cfg.theme, ...pal }
  } else rejected.push({ field: 'palette', reason: 'couleurs invalides ou contraste insuffisant' })
  const pair = FONT_PAIRS[ai.fontPairIndex]
  if (pair) cfg.theme = { ...cfg.theme, headingFont: pair.heading, bodyFont: pair.body }
  if (ok('hero.eyebrow', ai.hero.eyebrow, 60)) cfg.hero.eyebrow = ai.hero.eyebrow
  if (ok('hero.subtitle', ai.hero.subtitle, 300)) cfg.hero.subtitle = ai.hero.subtitle
  if (cfg.hero.primaryCta && ok('hero.primaryCtaLabel', ai.hero.primaryCtaLabel, 40)) cfg.hero.primaryCta.label = ai.hero.primaryCtaLabel
  // hero.title stays the business name (fact)
  for (const s of cfg.sections) {
    if (s.type === 'about' && ok('about.title', ai.about.title, 100) && ok('about.body', ai.about.body, 1500)) {
      s.title = ai.about.title
      s.body = ai.about.body
    }
    if (s.type === 'services') {
      const items = ai.services.filter((it, i) => ok(`services[${i}]`, `${it.title} ${it.description}`, 380)).slice(0, 8)
      if (items.length >= 2) s.items = items.map((it) => ({ title: it.title.slice(0, 80), description: it.description.slice(0, 300), icon: it.icon, indicative: true }))
    }
    if (s.type === 'benefits') {
      const items = ai.benefits.filter((it, i) => ok(`benefits[${i}]`, `${it.title} ${it.description}`, 380)).slice(0, 4)
      if (items.length) s.items = items.map((it) => ({ title: it.title.slice(0, 80), description: it.description.slice(0, 300), icon: it.icon }))
    }
    if (s.type === 'faq') {
      const items = ai.faq.filter((it, i) => ok(`faq[${i}]`, `${it.q} ${it.a}`, 660)).slice(0, 6)
      if (items.length) s.items = items.map((it) => ({ q: it.q.slice(0, 160), a: it.a.slice(0, 500) }))
    }
  }
  if (ok('seo.title', ai.seo.title, 70)) cfg.seo.title = ai.seo.title
  if (ok('seo.description', ai.seo.description, 170)) cfg.seo.description = ai.seo.description
  cfg.navigation = buildNavigation(cfg.sections)
  return { config: cfg, report: { rejected } }
}
