import { measurePersonalizedScene } from '../glass/measure'
import { glassSceneSchema, type GlassScene } from '@/lib/site/glass-scene'
import { sanitizeSilhouette } from '../glass/silhouette'
import { renderPersonalizedDocument } from '../glass/personalized-document'
import { personalizedSystem, personalizedBrief } from './personalized-prompt'
import { parse } from 'node-html-parser'
import { sql } from '../../core/db'
import { randomToken } from '../../core/crypto'
import { auditLog } from '../../core/audit'
import { AppError, NotConfiguredError } from '../../core/errors'
import { getSettings } from '../../core/settings'
import { aiAvailability, generateStructured } from '../../ai/client'
import { loadBusinessFacts } from '../facts'
import type { BusinessFacts } from '@/lib/site/facts'
import { bespokeOutputSchema, htmlSiteSchema, isHtmlSite, type BespokeOutput, type HtmlSite, type QualityIssue } from '@/lib/site/bespoke-schema'
import { BESPOKE_SYSTEM, buildBespokePrompt, buildRevisionPrompt } from './prompt'
import { sanitizeSiteHtml } from './sanitize'
import { checkAgainstFacts } from './checks'
import { captureForReview, measureRendered } from './measure'

export const BESPOKE_TEMPLATE_ID = 'sur-mesure'

type DesignOutput = BespokeOutput & {glassScene?: GlassScene}

export interface PipelineResult {
  output: DesignOutput
  html: string
  removed: string[]
  issues: QualityIssue[]
  passes: number
  model: string
  costUsd: number
}

/**
 * generate → sanitize → fact checks → rendered checks (Chromium) → up to N correction passes fed with
 * the measured problems. Critical problems (invented contact data or claims) that survive all passes
 * abort the generation: such a site is never published.
 */
export async function runBespokePipeline(input: { facts: BusinessFacts; prompt: string; mediaUrls: string[]; passes: number; visualReview?: boolean; measure?: boolean; personalized?: boolean; jobId?: string | null; log?: (m: string) => Promise<void> | void }): Promise<PipelineResult> {
  const system = input.personalized ? await personalizedSystem() : BESPOKE_SYSTEM
  const call = async (prompt: string, images?: { mediaType: 'image/jpeg'; data: string }[]) => {
    const request = {task:'site_bespoke' as const,system,instructions:prompt,images,businessId:input.facts.businessId,jobId:input.jobId}
    const response = input.personalized
      ? await generateStructured({...request,schema:bespokeOutputSchema.extend({glassScene:glassSceneSchema})})
      : await generateStructured({...request,schema:bespokeOutputSchema})
    const data:DesignOutput=response.data
    return {...response,data}
  }
  const evaluate = async (html: string, scene?: GlassScene) => {
    const s = sanitizeSiteHtml(html, input.mediaUrls)
    const factIssues = checkAgainstFacts(s.html, input.facts)
    if (input.personalized) {
      if (parse(s.html).querySelectorAll('[data-glass-scene]').length !== 1) factIssues.push({code:'scene_slot',severity:'critical',message:'Le site doit contenir exactement un emplacement data-glass-scene.'})
      try { if(!scene) throw new Error('Direction 3D manquante'); sanitizeSilhouette(scene.silhouette) } catch(error) { factIssues.push({code:'scene_svg',severity:'critical',message:(error as Error).message}) }
    }
    const rendered = input.measure === false ? [] : await measureRendered(s.html)
    if(input.personalized && scene && input.measure !== false && !factIssues.some(i=>i.severity==='critical')) {
      const document=await renderPersonalizedDocument({schemaVersion:1,kind:'html',html:s.html,glassScene:scene,designPlan:null,businessName:input.facts.name,media:[],report:null},{mode:'editor'})
      rendered.push(...await measurePersonalizedScene(document))
    }
    return { ...s, issues: [...factIssues, ...rendered] }
  }
  // lower is better: a pass that regresses never replaces a better candidate
  const weight = (issues: QualityIssue[]) => issues.reduce((s, i) => s + (i.severity === 'critical' ? 100 : i.severity === 'major' ? 10 : 1), 0)
  await input.log?.('Conception du site (plan de design + HTML)…')
  let r = await call(input.prompt)
  let cost = r.costUsd
  let ev = await evaluate(r.data.html, r.data.glassScene)
  let best = { r, ev }
  let passes = 0
  let visualDone = false
  while (passes < input.passes) {
    const needFix = ev.issues.some((i) => i.severity !== 'minor')
    const doVisual = !!input.visualReview && !visualDone
    if (!needFix && !doVisual) break
    passes++
    const reviewHtml = input.personalized && r.data.glassScene ? await renderPersonalizedDocument({schemaVersion:1,kind:'html',html:ev.html,businessName:input.facts.name,designPlan:r.data.designPlan,glassScene:r.data.glassScene,media:[],report:null},{mode:'editor'}).catch(()=>ev.html) : ev.html
    const images = input.visualReview ? await captureForReview(reviewHtml, !!input.personalized).catch(() => undefined) : undefined
    if (images) visualDone = true
    await input.log?.(`Passe ${passes}/${input.passes} : ${needFix ? `${ev.issues.filter((i) => i.severity !== 'minor').length} problème(s) à corriger` : 'critique visuelle des captures'}${images ? ' (avec captures)' : ''}`)
    r = await call(buildRevisionPrompt(ev.html, input.facts, { issues: ev.issues, visual: !!images }) + (input.personalized ? '\nConserve la scène : renvoie glassScene avec la silhouette et la palette, et exactement un bloc data-glass-scene dans le HTML.' : ''), images)
    cost += r.costUsd
    ev = await evaluate(r.data.html, r.data.glassScene)
    if (weight(ev.issues) <= weight(best.ev.issues)) best = { r, ev }
  }
  const critical = best.ev.issues.filter((i) => i.severity === 'critical')
  if (critical.length) throw new AppError(`Site rejeté (informations non vérifiées) : ${critical.map((i) => i.message).join(' ; ').slice(0, 600)}`, 422, 'BESPOKE_REJECTED')
  return { output: best.r.data, html: best.ev.html, removed: best.ev.removed, issues: best.ev.issues, passes, model: best.r.model, costUsd: cost }
}

export async function generateBespokeWebsite(businessId: string, opts: { styleHint?: string | null; personalized?: boolean; jobId?: string | null; log?: (m: string) => Promise<void> | void } = {}) {
  const started = Date.now()
  const avail = await aiAvailability()
  if (!avail.available) throw new NotConfiguredError('IA', `${avail.reason ?? 'non configurée'} — la génération « sur mesure » nécessite Claude ou Codex (abonnement) ou une clé API`)
  const settings = await getSettings()
  const facts = await loadBusinessFacts(businessId)
  const db = sql()
  const token = randomToken(24)
  const [site] = await db<{ id: string }[]>`
    insert into generated_websites (business_id, template_id, style, status, preview_token, preview_expires_at, generator)
    values (${businessId}, ${BESPOKE_TEMPLATE_ID}, ${opts.styleHint || 'sur mesure'}, 'GENERATING', ${token}, ${new Date(Date.now() + settings.sites.previewTtlDays * 86400_000)}, ${`ai:${avail.provider}:${opts.personalized ? 'personnalise-skill' : 'sur-mesure'}`})
    returning id`
  const websiteId = site!.id
  try {
    const r = await runBespokePipeline({ facts, personalized: opts.personalized, prompt: opts.personalized ? personalizedBrief(facts, settings.ai.customSiteInstructions) : buildBespokePrompt(facts, { styleHint: opts.styleHint, customInstructions: settings.ai.customSiteInstructions }), mediaUrls: [], passes: settings.sites.qualityPasses, visualReview: settings.sites.visualReview, jobId: opts.jobId, log: opts.log })
    const version: HtmlSite = htmlSiteSchema.parse({ schemaVersion: 1, kind: 'html', html: r.html, glassScene: r.output.glassScene, designPlan: r.output.designPlan, businessName: facts.name, media: [], report: { passes: r.passes, issues: r.issues, removed: r.removed } })
    await db`insert into website_versions (website_id, version, config, created_by, note)
             values (${websiteId}, 1, ${db.json(version as never)}, 'ai', ${`Sur mesure — ${r.passes} correction(s), ${r.issues.length} remarque(s) restante(s)`})`
    const duration = Date.now() - started
    await db`update generated_websites set status = 'READY', current_version = 1, model = ${r.model}, cost_usd = ${r.costUsd}, duration_ms = ${duration} where id = ${websiteId}`
    await db`update businesses set pipeline_status = 'WEBSITE_GENERATED' where id = ${businessId} and pipeline_status in ('NEW','DISCOVERED','ENRICHED','QUALIFIED')`
    await auditLog({ action: 'website.generated', entityType: 'business', entityId: businessId, data: { websiteId, generator: 'bespoke', model: r.model, passes: r.passes, issues: r.issues.length } })
    return { websiteId, version: 1, generator: `ai:${avail.provider}:${opts.personalized ? 'personnalise-skill' : 'sur-mesure'}`, model: r.model, costUsd: r.costUsd, durationMs: duration, report: null, previewToken: token, passes: r.passes, issues: r.issues }
  } catch (e) {
    await db`update generated_websites set status = 'ERROR', error = ${(e as Error).message.slice(0, 1000)} where id = ${websiteId}`
    throw e
  }
}

/** "Change X" — the AI revises the current bespoke version following the admin's instruction. */
export async function reviseBespokeWebsite(websiteId: string, instruction: string, opts: { jobId?: string | null; log?: (m: string) => Promise<void> | void } = {}) {
  const db = sql()
  const [w] = await db<{ business_id: string; current_version: number }[]>`select business_id, current_version from generated_websites where id = ${websiteId}`
  if (!w) throw new AppError('Site introuvable', 404)
  const [v] = await db<{ config: unknown }[]>`select config from website_versions where website_id = ${websiteId} and version = ${w.current_version}`
  const current = htmlSiteSchema.safeParse(v?.config)
  if (!current.success || !isHtmlSite(current.data)) throw new AppError('Ce site n’est pas un site « sur mesure »', 400)
  const facts = await loadBusinessFacts(w.business_id)
  const settings = await getSettings()
  const r = await runBespokePipeline({ facts, personalized: !!current.data.glassScene, prompt: buildRevisionPrompt(current.data.html, facts, { instruction }) + (current.data.glassScene ? '\nSite personnalisé 3D : conserve un bloc data-glass-scene, renvoie glassScene. Direction actuelle : ' + JSON.stringify(current.data.glassScene) : ''), mediaUrls: current.data.media.map((m) => m.url), passes: settings.sites.qualityPasses, visualReview: false, jobId: opts.jobId, log: opts.log })
  const next = w.current_version + 1
  const version: HtmlSite = { ...current.data, html: r.html, glassScene: r.output.glassScene, designPlan: r.output.designPlan, report: { passes: r.passes, issues: r.issues, removed: r.removed } }
  await db.begin(async (tx) => {
    await tx`insert into website_versions (website_id, version, config, created_by, note) values (${websiteId}, ${next}, ${tx.json(version as never)}, 'ai', ${`Modification : ${instruction.slice(0, 180)}`})`
    await tx`update generated_websites set current_version = ${next}, model = ${r.model}, cost_usd = cost_usd + ${r.costUsd} where id = ${websiteId}`
  })
  return { version: next, passes: r.passes, issues: r.issues }
}
