import { z } from 'zod'
import { glassSceneSchema } from './glass-scene'

/** What the model returns for a bespoke site. */
export const bespokeOutputSchema = z.object({
  designPlan: z.object({
    concept: z.string().describe('Concept visuel en 1-2 phrases, propre à ce commerce'),
    palette: z.array(z.object({ name: z.string(), hex: z.string() })).describe('4 à 6 couleurs nommées'),
    typography: z.string().describe('Polices (Google Fonts) et leur rôle, échelle typographique'),
    layout: z.string().describe('Concept de mise en page, alignements'),
    signature: z.string().describe("L'élément mémorable unique de ce site"),
    revisions: z.string().describe('Ce qui a été changé après relecture du plan contre le brief, et pourquoi'),
  }),
  html: z.string().min(500).describe('Document HTML5 complet, un seul fichier, CSS dans <style>, sans JavaScript'),
})
export type BespokeOutput = z.infer<typeof bespokeOutputSchema>

export const qualityIssueSchema = z.object({ code: z.string(), severity: z.enum(['critical', 'major', 'minor']), message: z.string() })
export type QualityIssue = z.infer<typeof qualityIssueSchema>

/** Stored version of a bespoke site (website_versions.config). */
export const htmlSiteSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('html'),
  glassScene: glassSceneSchema.optional(),
  html: z.string().min(200).max(600_000),
  designPlan: bespokeOutputSchema.shape.designPlan.nullable(),
  businessName: z.string(),
  /** media the admin added with a licence; only these URLs may be referenced by <img> / url() */
  media: z.array(z.object({ id: z.string(), url: z.string().url(), alt: z.string(), license: z.string() })).default([]),
  report: z.object({ passes: z.number().int(), issues: z.array(qualityIssueSchema), removed: z.array(z.string()) }).nullable().default(null),
})
export type HtmlSite = z.infer<typeof htmlSiteSchema>

import { siteConfigSchema, type SiteConfig } from './schema'

/** A stored website version is either a structured template config or a bespoke HTML site. */
export const websiteVersionSchema = z.union([htmlSiteSchema, siteConfigSchema])
export type WebsiteVersionData = HtmlSite | SiteConfig
export const isHtmlSite = (v: WebsiteVersionData): v is HtmlSite => (v as HtmlSite).kind === 'html'
