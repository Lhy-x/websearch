import { z } from 'zod'

export const STYLES = ['minimaliste', 'premium', 'moderne', 'editorial', 'institutionnel', 'creatif', 'artisanal', 'elegant', 'haut_de_gamme'] as const
export const LAYOUTS = ['salon', 'barber', 'table', 'bakery', 'trade', 'studio', 'corporate'] as const
export const ICONS = ['scissors', 'sparkles', 'heart', 'star', 'clock', 'map', 'phone', 'mail', 'wrench', 'zap', 'droplet', 'shield', 'check', 'home', 'car', 'camera', 'compass', 'briefcase', 'chart', 'leaf', 'coffee', 'utensils', 'wheat', 'brush', 'hammer', 'key', 'users', 'calendar', 'truck', 'flame', 'sun', 'layers'] as const

const text = (max: number) => z.string().trim().max(max)
const href = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^(#[a-z0-9-]*|tel:\+?[0-9 ().-]+|mailto:[^\s<>"]+|https?:\/\/[^\s<>"]+)$/i.test(v), 'Lien non autorisé (tel:, mailto:, http(s):// ou #ancre)')

export const ctaSchema = z.object({ label: text(40), href })

export const themeSchema = z.object({
  primary: z.string().regex(/^#[0-9a-f]{6}$/i),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  background: z.string().regex(/^#[0-9a-f]{6}$/i),
  surface: z.string().regex(/^#[0-9a-f]{6}$/i),
  text: z.string().regex(/^#[0-9a-f]{6}$/i),
  muted: z.string().regex(/^#[0-9a-f]{6}$/i),
  headingFont: text(60),
  bodyFont: text(60),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'full']),
  density: z.enum(['compact', 'comfortable', 'airy']),
  buttonStyle: z.enum(['solid', 'outline', 'pill']),
  headingCase: z.enum(['normal', 'uppercase']).default('normal'),
})

export const mediaSchema = z.object({
  id: text(40),
  url: z.string().url().max(1000),
  alt: text(200),
  license: text(120),
  source: text(200).optional(),
})

const item = z.object({ title: text(80), description: text(300).default(''), icon: z.enum(ICONS).optional() })

const sectionBase = { id: z.string().regex(/^[a-z0-9-]{1,40}$/), enabled: z.boolean().default(true), title: text(100), intro: text(400).default('') }

export const sectionSchema = z.discriminatedUnion('type', [
  z.object({ ...sectionBase, type: z.literal('about'), body: text(1500) }),
  z.object({ ...sectionBase, type: z.literal('services'), items: z.array(item.extend({ indicative: z.boolean().default(true) })).max(12), note: text(200).default('') }),
  z.object({ ...sectionBase, type: z.literal('benefits'), items: z.array(item).max(8) }),
  z.object({ ...sectionBase, type: z.literal('process'), items: z.array(item).max(6) }),
  z.object({ ...sectionBase, type: z.literal('gallery'), mediaIds: z.array(z.string()).max(12) }),
  z.object({ ...sectionBase, type: z.literal('hours'), lines: z.array(text(80)).max(10), source: text(120) }),
  z.object({ ...sectionBase, type: z.literal('area'), body: text(600), places: z.array(text(60)).max(20).default([]) }),
  z.object({ ...sectionBase, type: z.literal('faq'), items: z.array(z.object({ q: text(160), a: text(500) })).max(10) }),
  z.object({ ...sectionBase, type: z.literal('cta'), body: text(300), cta: ctaSchema }),
  z.object({ ...sectionBase, type: z.literal('contact') }),
])

export const siteConfigSchema = z.object({
  schemaVersion: z.literal(1),
  templateId: text(40),
  layout: z.enum(LAYOUTS),
  style: z.enum(STYLES),
  language: z.enum(['fr', 'en', 'de', 'nl']).default('fr'),
  business: z.object({
    name: text(120).min(1),
    sectorLabel: text(80),
    city: text(80).nullable(),
    address: text(200).nullable(),
    postcode: text(12).nullable(),
    phone: text(30).nullable(),
    phoneE164: text(20).nullable(),
    email: z.string().email().max(254).nullable(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
    socials: z.array(z.object({ network: text(20), url: z.string().url().max(500) })).max(6).default([]),
  }),
  theme: themeSchema,
  navigation: z.array(z.object({ label: text(30), target: z.string().regex(/^#[a-z0-9-]+$/) })).max(7),
  hero: z.object({
    eyebrow: text(60).default(''),
    title: text(120).min(1),
    subtitle: text(300),
    primaryCta: ctaSchema.nullable(),
    secondaryCta: ctaSchema.nullable(),
    mediaId: z.string().nullable().default(null),
  }),
  sections: z.array(sectionSchema).max(14),
  media: z.array(mediaSchema).max(24).default([]),
  seo: z.object({ title: text(70), description: text(170) }),
  disclaimer: text(300),
})

export type SiteConfig = z.infer<typeof siteConfigSchema>
export type Section = z.infer<typeof sectionSchema>
export type SiteTheme = z.infer<typeof themeSchema>
export type IconName = (typeof ICONS)[number]
export type SiteStyle = (typeof STYLES)[number]
export type Layout = (typeof LAYOUTS)[number]

/**
 * Words/patterns that would turn the demo into a fabricated claim (reviews, ratings, years of experience,
 * prices, certifications, awards…). AI output containing them is rejected for that field.
 */
/** Unicode-aware word boundaries (JS `\b` ignores accented letters such as « é »). */
const W = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, 'iu')

export const FORBIDDEN_CLAIMS: RegExp[] = [
  W('\\d+\\s*(?:ans|années|years)'),
  W('depuis\\s+(?:19|20)\\d{2}'),
  W('avis|témoignages?|reviews?|étoiles|note de \\d'),
  /[★⭐]/u,
  W('\\d+(?:[.,]\\d+)?\\s*(?:€|eur|euros|chf|\\$)'),
  /(?:€|chf)\s*\d/iu,
  W('certifiée?s?|certification|labellisée?s?|label|qualibat|rge|agréée?s?|primée?s?|récompensée?s?|récompenses?|awards?|meilleur ouvrier|mof'),
  W('n°\\s*1|numéro\\s*1|leader|le meilleur|la meilleure|les meilleurs'),
  W('\\d{2,}\\s*(?:clients|réalisations|projets|chantiers|interventions)'),
  W('garantie?\\s+\\d+'),
]

export function findForbiddenClaim(s: string): string | null {
  for (const re of FORBIDDEN_CLAIMS) {
    const m = s.match(re)
    if (m) return m[0]
  }
  return null
}
