import { z } from 'zod'
import { sql } from './db'
import { decryptSecret, encryptSecret } from './crypto'
import { env } from './env'

export const COST_MODES = ['LOW_COST', 'BALANCED', 'HIGH_QUALITY'] as const
export const SITE_STYLES = ['minimaliste', 'premium', 'moderne', 'editorial', 'institutionnel', 'creatif', 'artisanal', 'elegant', 'haut_de_gamme'] as const

export const scoringWeightsSchema = z.object({
  noWebsiteConfirmed: z.number().min(0).max(100).default(30),
  noWebsiteKnown: z.number().min(0).max(100).default(18),
  websiteBroken: z.number().min(0).max(100).default(26),
  websiteLowQuality: z.number().min(0).max(100).default(18),
  websiteOutdated: z.number().min(0).max(100).default(14),
  sectorRelevance: z.number().min(0).max(100).default(20),
  emailAvailable: z.number().min(0).max(100).default(15),
  phoneAvailable: z.number().min(0).max(100).default(8),
  dataQuality: z.number().min(0).max(100).default(10),
  operatingOpen: z.number().min(0).max(100).default(5),
  interactionPenaltyContacted: z.number().min(0).max(100).default(10),
  explicitNeed: z.number().min(0).max(100).default(10),
})

export const settingsSchema = z.object({
  ai: z
    .object({
      provider: z.enum(['none', 'claude-code', 'codex', 'anthropic', 'openai', 'openrouter']).default('none'),
      cheapModel: z.string().default(''),
      strongModel: z.string().default(''),
      temperature: z.number().min(0).max(1.5).default(0.6),
      dailyBudgetUsd: z.number().min(0).default(5),
      /** subscription providers (claude-code / codex): max model calls per day */
      subscriptionDailyCalls: z.number().int().min(1).max(2000).default(80),
      costMode: z.enum(COST_MODES).default('BALANCED'),
      customSiteInstructions: z.string().max(4000).default(''),
    })
    .prefault({}),
  search: z
    .object({
      defaultCountry: z.enum(['FR', 'BE', 'CH']).default('FR'),
      defaultRadiusKm: z.number().min(1).max(100).default(10),
      maxResults: z.number().int().min(10).max(5000).default(500),
      sources: z
        .object({
          overture: z.boolean().default(true),
          recherche_entreprises: z.boolean().default(true),
          osm: z.boolean().default(false),
          google_places: z.boolean().default(false),
        })
        .prefault({}),
    })
    .prefault({}),
  outreach: z
    .object({
      senderName: z.string().default(''),
      senderEmail: z.string().default(''),
      replyTo: z.string().default(''),
      signature: z.string().default(''),
      companyLegalLine: z.string().default(''),
      physicalAddress: z.string().default(''),
      defaultDailyLimit: z.number().int().min(1).max(2000).default(20),
      followupDelaysDays: z.array(z.number().int().min(1).max(60)).default([3, 7]),
      trackOpens: z.boolean().default(false),
    })
    .prefault({}),
  sites: z
    .object({
      defaultStyle: z.enum(SITE_STYLES).default('moderne'),
      language: z.enum(['fr', 'en', 'de', 'nl']).default('fr'),
      previewTtlDays: z.number().int().min(1).max(365).default(30),
      previewBaseUrl: z.string().default(''),
      /** bespoke = AI writes a unique full site (best quality); template = structured templates */
      generationMode: z.enum(['bespoke', 'template']).default('bespoke'),
      /** automatic review/correction passes after a bespoke generation (rendered checks in Chromium) */
      qualityPasses: z.number().int().min(0).max(3).default(1),
      /** the model looks at real screenshots of its site and refines it (one extra call) */
      visualReview: z.boolean().default(true),
      demoDisclaimer: z
        .string()
        .default("Démonstration indépendante réalisée à titre de proposition. Ce site n'est pas le site officiel de l'établissement."),
    })
    .prefault({}),
  automation: z
    .object({
      maxConcurrentJobs: z.number().int().min(1).max(16).default(2),
      maxRetries: z.number().int().min(0).max(10).default(3),
      enrichBatchSize: z.number().int().min(1).max(500).default(50),
      maxJobsPerRun: z.number().int().min(1).max(10000).default(1000),
    })
    .prefault({}),
  scoring: scoringWeightsSchema.prefault({}),
  targetSectors: z.array(z.string()).default([]),
})

export type Settings = z.infer<typeof settingsSchema>

export const SECRET_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GOOGLE_PLACES_API_KEY',
  'INSEE_SIRENE_API_KEY',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'SMTP_PASSWORD',
  'IMAP_PASSWORD',
] as const
export type SecretKey = (typeof SECRET_KEYS)[number]

export async function getSettings(): Promise<Settings> {
  const [row] = await sql()<{ data: unknown }[]>`select data from admin_settings where id = 1`
  return settingsSchema.parse(row?.data ?? {})
}

export async function updateSettings(patch: unknown): Promise<Settings> {
  const current = await getSettings()
  const merged = settingsSchema.parse(deepMerge(current, patch))
  await sql()`update admin_settings set data = ${sql().json(merged as never)}, updated_at = now() where id = 1`
  return merged
}

function deepMerge(a: unknown, b: unknown): unknown {
  if (b === undefined) return a
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out: Record<string, unknown> = { ...(a as Record<string, unknown>) }
    for (const [k, v] of Object.entries(b as Record<string, unknown>)) out[k] = deepMerge(out[k], v)
    return out
  }
  return b
}

/** Resolve a secret: environment variable first, then encrypted DB value. */
export async function getSecret(key: SecretKey): Promise<string> {
  const fromEnv = (env() as Record<string, unknown>)[key]
  if (typeof fromEnv === 'string' && fromEnv) return fromEnv
  const [row] = await sql()<{ secrets: Record<string, string> }[]>`select secrets from admin_settings where id = 1`
  const blob = row?.secrets?.[key]
  if (!blob) return ''
  try {
    return decryptSecret(blob)
  } catch {
    return ''
  }
}

export async function setSecret(key: SecretKey, value: string | null) {
  if (value === null || value === '') {
    await sql()`update admin_settings set secrets = secrets - ${key}, updated_at = now() where id = 1`
    return
  }
  const enc = encryptSecret(value)
  await sql()`update admin_settings set secrets = secrets || ${sql().json({ [key]: enc })}, updated_at = now() where id = 1`
}

/** Which secrets are configured, and from where — never returns values. */
export async function secretStatus(): Promise<Record<SecretKey, 'env' | 'db' | 'missing'>> {
  const [row] = await sql()<{ secrets: Record<string, string> }[]>`select secrets from admin_settings where id = 1`
  const out = {} as Record<SecretKey, 'env' | 'db' | 'missing'>
  for (const k of SECRET_KEYS) {
    const e = (env() as Record<string, unknown>)[k]
    out[k] = typeof e === 'string' && e ? 'env' : row?.secrets?.[k] ? 'db' : 'missing'
  }
  return out
}

export async function getFlags(): Promise<{ globalPause: boolean; emergencyStop: boolean }> {
  const [row] = await sql()<{ global_pause: boolean; campaigns_emergency_stop: boolean }[]>`
    select global_pause, campaigns_emergency_stop from admin_settings where id = 1`
  return { globalPause: !!row?.global_pause, emergencyStop: !!row?.campaigns_emergency_stop }
}

export async function setFlags(flags: { globalPause?: boolean; emergencyStop?: boolean }) {
  if (flags.globalPause !== undefined) await sql()`update admin_settings set global_pause = ${flags.globalPause} where id = 1`
  if (flags.emergencyStop !== undefined)
    await sql()`update admin_settings set campaigns_emergency_stop = ${flags.emergencyStop} where id = 1`
}
