import { sql } from '../core/db'
import { randomToken } from '../core/crypto'
import { auditLog } from '../core/audit'
import { AppError, NotConfiguredError } from '../core/errors'
import { getSettings } from '../core/settings'
import { siteConfigSchema, type SiteConfig, type SiteStyle } from '@/lib/site/schema'
import { websiteVersionSchema, isHtmlSite, type WebsiteVersionData } from '@/lib/site/bespoke-schema'
import { sanitizeSiteHtml } from './bespoke/sanitize'
import { buildDeterministicConfig, enforceFacts } from '@/lib/site/build'
import { TEMPLATE_BY_ID } from '@/lib/site/templates'
import { aiAvailability, generateStructured } from '../ai/client'
import { aiSiteContentSchema, buildSiteInstructions, mergeAiContent, SITE_SYSTEM_PROMPT, type MergeReport } from './ai-content'
import { loadBusinessFacts } from './facts'

export interface GenerateOptions {
  templateId?: string | null
  style?: SiteStyle | null
  /** auto: AI if configured (and not LOW_COST), deterministic otherwise */
  generator?: 'auto' | 'ai' | 'deterministic' | 'glass3d'
  jobId?: string | null
}

export interface GenerateResult {
  websiteId: string
  version: number
  generator: string
  model: string | null
  costUsd: number
  durationMs: number
  report: MergeReport | null
  previewToken: string
}

export async function generateWebsite(businessId: string, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const started = Date.now()
  const settings = await getSettings()
  const facts = await loadBusinessFacts(businessId)
  const templateId = opts.templateId && TEMPLATE_BY_ID.has(opts.templateId) ? opts.templateId : facts.templateId
  const skeleton = buildDeterministicConfig(facts, { templateId, style: opts.style ?? undefined, disclaimer: settings.sites.demoDisclaimer, language: settings.sites.language })
  const mode = opts.generator ?? 'auto'
  if (mode === 'glass3d') {
    const shape = /electric|électric/.test(facts.sectorLabel.toLowerCase()) ? 'bolt' : /bâtiment|immobilier/.test(facts.sectorLabel.toLowerCase()) ? 'home' : /jardin|fleur/.test(facts.sectorLabel.toLowerCase()) ? 'bloom' : 'spark'
    skeleton.glass3d = { shape }
  }
  const avail = await aiAvailability()
  const useAi = mode === 'ai' || (mode === 'auto' && avail.available && settings.ai.costMode !== 'LOW_COST')
  if (mode === 'ai' && !avail.available) throw new NotConfiguredError('IA', avail.reason ?? 'fournisseur non configuré')

  const db = sql()
  const token = randomToken(24)
  const expires = new Date(Date.now() + settings.sites.previewTtlDays * 86400_000)
  const [site] = await db<{ id: string }[]>`
    insert into generated_websites (business_id, template_id, style, status, preview_token, preview_expires_at, generator)
    values (${businessId}, ${templateId}, ${skeleton.style}, 'GENERATING', ${token}, ${expires}, ${mode === 'glass3d' ? 'glass3d' : useAi ? 'ai:' + avail.provider : 'deterministic'})
    returning id`
  const websiteId = site!.id
  try {
    let config: SiteConfig = skeleton
    let model: string | null = null
    let cost = 0
    let report: MergeReport | null = null
    if (useAi) {
      const r = await generateStructured({
        task: 'site_generation',
        system: SITE_SYSTEM_PROMPT,
        instructions: buildSiteInstructions(facts, skeleton, opts.style ?? null, settings.ai.customSiteInstructions),
        schema: aiSiteContentSchema,
        businessId,
        jobId: opts.jobId,
      })
      const merged = mergeAiContent(skeleton, r.data, opts.style ?? null)
      config = enforceFacts(merged.config, facts)
      report = merged.report
      model = r.model
      cost = r.costUsd
    }
    config = siteConfigSchema.parse(config)
    await db`insert into website_versions (website_id, version, config, created_by, note)
             values (${websiteId}, 1, ${db.json(config as never)}, ${useAi ? 'ai' : 'deterministic'}, ${report?.rejected.length ? `${report.rejected.length} champ(s) IA rejeté(s)` : null})`
    const duration = Date.now() - started
    await db`update generated_websites set status = 'READY', current_version = 1, style = ${config.style}, model = ${model}, cost_usd = ${cost}, duration_ms = ${duration} where id = ${websiteId}`
    await db`update businesses set pipeline_status = 'WEBSITE_GENERATED'
             where id = ${businessId} and pipeline_status in ('NEW','DISCOVERED','ENRICHED','QUALIFIED')`
    await auditLog({ action: 'website.generated', entityType: 'business', entityId: businessId, data: { websiteId, generator: mode === 'glass3d' ? 'glass3d' : useAi ? 'ai' : 'deterministic', model, cost, rejected: report?.rejected } })
    return { websiteId, version: 1, generator: mode === 'glass3d' ? 'glass3d' : useAi ? `ai:${avail.provider}` : 'deterministic', model, costUsd: cost, durationMs: duration, report, previewToken: token }
  } catch (e) {
    await db`update generated_websites set status = 'ERROR', error = ${(e as Error).message?.slice(0, 1000) ?? 'erreur'} where id = ${websiteId}`
    throw e
  }
}

export async function getWebsiteVersion(websiteId: string, version?: number): Promise<{ version: number; config: WebsiteVersionData } | null> {
  const db = sql()
  const [row] = version
    ? await db<{ version: number; config: unknown }[]>`select version, config from website_versions where website_id = ${websiteId} and version = ${version}`
    : await db<{ version: number; config: unknown }[]>`select v.version, v.config from website_versions v join generated_websites w on w.id = v.website_id and v.version = w.current_version where w.id = ${websiteId} and w.deleted_at is null`
  if (!row) return null
  return { version: row.version, config: websiteVersionSchema.parse(row.config) }
}

/** Save an edited config as a new version (validated). Optimistic concurrency on baseVersion. */
export async function saveWebsiteVersion(websiteId: string, input: unknown, opts: { baseVersion?: number; note?: string } = {}): Promise<number> {
  let config = websiteVersionSchema.parse(input)
  // manual HTML edits go through the same sanitizer as AI output
  if (isHtmlSite(config)) config = { ...config, html: sanitizeSiteHtml(config.html, config.media.map((m) => m.url)).html }
  const db = sql()
  return db.begin(async (tx) => {
    const [w] = await tx<{ current_version: number | null; business_id: string }[]>`select current_version, business_id from generated_websites where id = ${websiteId} and deleted_at is null for update`
    if (!w) throw new AppError('Site introuvable', 404, 'NOT_FOUND')
    if (opts.baseVersion !== undefined && w.current_version !== opts.baseVersion)
      throw new AppError(`Conflit : la version ${w.current_version} a été enregistrée entre-temps.`, 409, 'CONFLICT')
    const next = (w.current_version ?? 0) + 1
    await tx`insert into website_versions (website_id, version, config, created_by, note) values (${websiteId}, ${next}, ${tx.json(config as never)}, 'manual', ${opts.note ?? null})`
    if (isHtmlSite(config)) await tx`update generated_websites set current_version = ${next} where id = ${websiteId}`
    else await tx`update generated_websites set current_version = ${next}, template_id = ${config.templateId}, style = ${config.style} where id = ${websiteId}`
    return next
  })
}

export async function restoreWebsiteVersion(websiteId: string, version: number): Promise<number> {
  const v = await getWebsiteVersion(websiteId, version)
  if (!v) throw new AppError('Version introuvable', 404, 'NOT_FOUND')
  return saveWebsiteVersion(websiteId, v.config, { note: `Restauration de la version ${version}` })
}

export interface PreviewLookup {
  websiteId: string
  businessId: string
  config: WebsiteVersionData
  status: 'ok' | 'disabled' | 'expired' | 'not_found'
}

export async function lookupPreview(token: string): Promise<PreviewLookup> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: 'not_found' } as PreviewLookup
  const [w] = await sql()<{ id: string; business_id: string; preview_enabled: boolean; preview_expires_at: Date | null; status: string }[]>`
    select id, business_id, preview_enabled, preview_expires_at, status from generated_websites where preview_token = ${token} and deleted_at is null`
  if (!w || w.status === 'ERROR' || w.status === 'GENERATING') return { status: 'not_found' } as PreviewLookup
  if (!w.preview_enabled || w.status === 'DISABLED') return { status: 'disabled' } as PreviewLookup
  if (w.preview_expires_at && w.preview_expires_at < new Date()) return { status: 'expired' } as PreviewLookup
  const v = await getWebsiteVersion(w.id)
  if (!v) return { status: 'not_found' } as PreviewLookup
  return { websiteId: w.id, businessId: w.business_id, config: v.config, status: 'ok' }
}
