import { z } from 'zod'
import { sql } from '../core/db'
import { env } from '../core/env'
import { getSettings } from '../core/settings'
import { searchParamsSchema } from '../search/params'
import { runSearch } from '../search/run-search'
import { enrichBusiness } from '../enrich/crawl'
import { auditWebsite } from '../enrich/audit'
import { generateWebsite } from '../sites/service'
import { generateBespokeWebsite, reviseBespokeWebsite } from '../sites/bespoke/generate'
import { NotConfiguredError } from '../core/errors'
import { captureWebsite } from '../sites/screenshots'
import { generateProposal } from '../proposals/service'
import { addProspects, tickCampaign } from '../campaigns/service'
import { flagStuckSending, sendOutbound } from '../email/send'
import { syncImap } from '../email/imap'
import { enqueueJob, type Job } from './queue'
import { runBackup } from './backup'
import { reconcileHosting,checkHostingDomain,sweepHosting } from '../hosting/service'
import { deliverCustomerAccess } from '../billing/customer-access'
import { getObject } from '../core/storage'
import { importCommitSchema, mapImportRows, parseImportFile } from '../connectors/import'
import { clusterRecords } from '../search/dedup'
import { persistCluster } from '../search/run-search'

export interface JobContext {
  job: Job
  log: (message: string, progress?: number) => Promise<void>
  isActive: () => Promise<boolean>
}

type Handler = (payload: unknown, ctx: JobContext) => Promise<unknown>

const uuid = z.string().uuid()

export const JOB_TYPES = {
  'hosting.reconcile':'Publication / suspension d’un site client',
  'hosting.domain_check':'Vérification du domaine client',
  'hosting.sweep':'Vérification des abonnements',
  'customer.access_email':'Envoi du lien de l’espace client',
  'search.run': 'Recherche de prospects',
  'business.enrich': 'Enrichissement',
  'business.audit': 'Audit de site',
  'website.generate': 'Génération de site',
  'website.capture': 'Captures du site',
  'website.revise': 'Modification d’un site sur mesure',
  'proposal.generate': 'Proposition commerciale',
  'campaign.tick': 'Planificateur de campagnes',
  'campaign.autofill': 'Remplissage automatique de campagne',
  'email.send': 'Envoi d’un email',
  'inbox.sync': 'Synchronisation IMAP',
  'maintenance.cleanup': 'Nettoyage',
  'backup.run': 'Sauvegarde',
  'import.run': 'Import de fichier',
} as const
export type JobType = keyof typeof JOB_TYPES

export const HANDLERS: Record<JobType, Handler> = {
  async 'hosting.reconcile'(p,ctx){const {orderId}=z.object({orderId:uuid}).parse(p);return reconcileHosting(orderId,(message,progress)=>ctx.log(message,progress))},
  async 'hosting.domain_check'(p){const {orderId,domain}=z.object({orderId:uuid,domain:z.string().max(253)}).parse(p);return checkHostingDomain(orderId,domain)},
  async 'hosting.sweep'(){return sweepHosting()},
  async 'customer.access_email'(p){return deliverCustomerAccess(p)},
  async 'search.run'(p, ctx) {
    const input = z.object({ runId: uuid.optional(), savedSearchId: uuid.optional(), scheduleId: uuid.optional(), params: z.unknown().optional(), autoEnrich: z.boolean().default(true) }).parse(p)
    const db = sql()
    let params = input.params ? searchParamsSchema.parse(input.params) : null
    if (!params && input.savedSearchId) {
      const [s] = await db<{ params: unknown }[]>`select params from saved_searches where id = ${input.savedSearchId}`
      if (!s) throw new Error('Recherche enregistrée introuvable')
      params = searchParamsSchema.parse(s.params)
    }
    if (!params) throw new Error('Paramètres de recherche manquants')
    let runId = input.runId
    if (!runId) {
      const [r] = await db<{ id: string }[]>`insert into search_runs (saved_search_id, params, job_id) values (${input.savedSearchId ?? null}, ${db.json(params as never)}, ${ctx.job.id}) returning id`
      runId = r!.id
    } else await db`update search_runs set job_id = ${ctx.job.id} where id = ${runId}`
    try {
      const res = await runSearch(runId, params, (m, pr) => ctx.log(m, pr), ctx.isActive)
      if (input.savedSearchId) {
        // diff with previous run of the same saved search
        const [prev] = await db<{ business_ids: string[] }[]>`select business_ids from search_runs where saved_search_id = ${input.savedSearchId} and id <> ${runId} and status = 'COMPLETED' order by created_at desc limit 1`
        const before = new Set(prev?.business_ids ?? [])
        const now = new Set(res.businessIds)
        const diff = { appeared: res.businessIds.filter((id) => !before.has(id)).length, disappeared: [...before].filter((id) => !now.has(id)).length }
        await db`update search_runs set source_reports = source_reports || ${db.json([{ diff }] as never)} where id = ${runId}`
      }
      if (input.autoEnrich && res.businessIds.length) {
        const s = await getSettings()
        for (let i = 0; i < res.businessIds.length; i += s.automation.enrichBatchSize)
          await enqueueJob('business.enrich', { businessIds: res.businessIds.slice(i, i + s.automation.enrichBatchSize),searchRunId:runId,aiSummary:false }, { priority: 120, idempotencyKey: `enrich:${runId}:${i}` })
      }
      return { runId, total: res.totalFound, new: res.newCount, mergePending: res.mergePending, reports: res.reports }
    } catch (e) {
      await db`update search_runs set status = 'FAILED', error = ${(e as Error).message}, finished_at = now() where id = ${runId}`
      throw e
    }
  },

  async 'business.enrich'(p, ctx) {
    const { businessIds, audit,aiSummary } = z.object({ businessIds: z.array(uuid).min(1).max(500), audit: z.boolean().default(true),aiSummary:z.boolean().default(true) }).parse(p)
    const out = { enriched: 0, failed: 0, auditsQueued: 0 }
    for (let i = 0; i < businessIds.length; i++) {
      if (!(await ctx.isActive())) break
      const id = businessIds[i]!
      try {
        const r = await enrichBusiness(id,{allowAi:aiSummary})
        await ctx.log(`Activité et avantages : ${r.summary.coverage==='limited'?'informations publiques encore limitées':r.summary.advantages.length+' avantage(s) sourcé(s)'}`)
        out.enriched++
        if (audit && r.crawls.some((c) => c.reachable || c.status !== null || c.error)) {
          const [b] = await sql()<{ website_url: string | null }[]>`select website_url from businesses where id = ${id}`
          if (b?.website_url) {
            await enqueueJob('business.audit', { businessId: id, url: b.website_url }, { priority: 130, idempotencyKey: `audit:${id}:${new Date().toISOString().slice(0, 10)}` })
            out.auditsQueued++
          }
        }
      } catch (e) {
        out.failed++
        await ctx.log(`⚠ ${id} : ${(e as Error).message}`)
      }
      await ctx.log(`${i + 1}/${businessIds.length} enrichis`, (i + 1) / businessIds.length)
    }
    return out
  },

  async 'business.audit'(p) {
    const { businessId, url } = z.object({ businessId: uuid, url: z.string().url().optional() }).parse(p)
    let target = url
    if (!target) {
      const [b] = await sql()<{ website_url: string | null }[]>`select website_url from businesses where id = ${businessId}`
      target = b?.website_url ?? undefined
    }
    if (!target) return { skipped: 'aucun site à auditer' }
    const r = await auditWebsite(businessId, target)
    return { auditId: r.auditId, score: r.score, presence: r.presence, issues: r.issues.length }
  },

  async 'website.generate'(p, ctx) {
    const input = z
      .object({ businessId: uuid, templateId: z.string().optional().nullable(), style: z.string().optional().nullable(), generator: z.enum(['auto', 'bespoke', 'ai', 'deterministic', 'glass3d', 'personalized']).default('personalized') })
      .parse(p)
    // Older clients still send "ai" or "auto". They now use the same custom pipeline,
    // never an AI-written text pasted into a catalogue layout or a silent fallback.
    const mode=input.generator==='ai'||input.generator==='auto'?'personalized':input.generator
    let r: { websiteId: string; version: number }
    if (mode === 'personalized') {
      await ctx.log('Conception personnalisée à partir du skill Premium 3D Glass : direction artistique, silhouette originale et site unique.')
      r = await generateBespokeWebsite(input.businessId,{personalized:true,styleHint:input.style,jobId:ctx.job.id,log:(m,progress)=>ctx.log(m,progress)})
    } else if (mode === 'bespoke') {
      r = await generateBespokeWebsite(input.businessId, { styleHint: input.style, jobId: ctx.job.id, log: (m,progress) => ctx.log(m,progress) })
    } else {
      r = await generateWebsite(input.businessId, { templateId: input.templateId, style: input.style as never, generator: mode, jobId: ctx.job.id })
    }
    await enqueueJob('website.capture', { websiteId: r.websiteId }, { priority: 90, idempotencyKey: `capture:${r.websiteId}:v${r.version}` })
    return r
  },

  async 'website.revise'(p, ctx) {
    const { websiteId, instruction } = z.object({ websiteId: uuid, instruction: z.string().min(3).max(2000) }).parse(p)
    const r = await reviseBespokeWebsite(websiteId, instruction, { jobId: ctx.job.id, log: (m) => ctx.log(m) })
    await enqueueJob('website.capture', { websiteId }, { priority: 90, idempotencyKey: `capture:${websiteId}:v${r.version}` })
    return { websiteId, ...r }
  },

  async 'website.capture'(p) {
    const { websiteId } = z.object({ websiteId: uuid }).parse(p)
    return captureWebsite(websiteId)
  },

  async 'proposal.generate'(p, ctx) {
    const input = z.object({ businessId: uuid, websiteId: uuid.optional().nullable(), offerId: uuid.optional().nullable(), strategyId: uuid.optional().nullable() }).parse(p)
    return generateProposal({ ...input, jobId: ctx.job.id })
  },

  async 'campaign.tick'() {
    const db = sql()
    const stuck = await flagStuckSending()
    const campaigns = await db<{ id: string }[]>`select id from campaigns where status = 'ACTIVE'`
    const results: Record<string, unknown> = {}
    for (const c of campaigns) results[c.id] = await tickCampaign(c.id)
    // approved one-off messages that are not part of a campaign
    const loose = await db<{ id: string }[]>`select id from outbound_messages where campaign_id is null and status = 'SCHEDULED' and scheduled_at <= now() limit 20`
    for (const m of loose) await sendOutbound(m.id)
    return { campaigns: campaigns.length, stuck, results }
  },

  async 'campaign.autofill'(p, ctx) {
    const { campaignId } = z.object({ campaignId: uuid }).parse(p)
    const db = sql()
    const [c] = await db<{ auto_filters: { savedSearchId?: string | null; minScore: number; requireEmail: boolean; maxPerRun: number } | null; auto_generate_site: boolean; status: string; mode: string }[]>`
      select auto_filters, auto_generate_site, status, mode from campaigns where id = ${campaignId}`
    if (!c || c.mode !== 'AUTO' || c.status !== 'ACTIVE' || !c.auto_filters) return { skipped: 'campagne non automatique ou inactive' }
    const f = c.auto_filters
    let scope = db`true`
    if (f.savedSearchId) {
      const [run] = await db<{ business_ids: string[] }[]>`select business_ids from search_runs where saved_search_id = ${f.savedSearchId} and status = 'COMPLETED' order by created_at desc limit 1`
      scope = db`b.id = any(${run?.business_ids ?? []}::uuid[])`
    }
    const candidates = await db<{ id: string }[]>`select b.id from businesses b where ${scope} and b.merged_into is null and b.archived_at is null and not b.do_not_contact
      and b.score >= ${f.minScore} and (${!f.requireEmail} or (b.email is not null and b.email_status <> 'INVALID'))
      and not exists (select 1 from campaign_prospects cp where cp.business_id = b.id)
      order by b.score desc limit ${f.maxPerRun}`
    if (c.auto_generate_site) {
      for (const b of candidates) {
        const [site] = await db`select 1 from generated_websites where business_id = ${b.id} and status = 'READY'`
        if (!site) await HANDLERS['website.generate']({ businessId: b.id }, ctx)
      }
    }
    const r = await addProspects(campaignId, candidates.map((x) => x.id))
    await db`update campaign_prospects set status = 'ACTIVE', next_send_at = now() where campaign_id = ${campaignId} and status = 'APPROVED'`
    return r
  },

  async 'email.send'(p) {
    const { messageId } = z.object({ messageId: uuid }).parse(p)
    return sendOutbound(messageId)
  },

  async 'inbox.sync'(_p, ctx) {
    return syncImap((m) => ctx.log(m))
  },

  async 'maintenance.cleanup'() {
    const db = sql()
    const logs = await db`delete from job_logs where created_at < now() - interval '30 days' returning id`
    const jobs = await db`delete from automation_jobs where status in ('COMPLETED','CANCELLED') and finished_at < now() - interval '30 days' returning id`
    const expired = await db`update generated_websites set preview_enabled = false where preview_enabled and preview_expires_at < now() returning id`
    const attempts = await db`delete from login_attempts where created_at < now() - interval '7 days' returning id`
    const accessRequests = await db`delete from customer_access_requests where created_at < now() - interval '7 days' returning id`
    return { jobLogs: logs.length, jobs: jobs.length, previewsExpired: expired.length, loginAttempts: attempts.length, accessRequests: accessRequests.length }
  },

  async 'import.run'(p, ctx) {
    const input = importCommitSchema.parse(p)
    const { rows } = await parseImportFile(await getObject(input.key), input.filename)
    const { places, errors } = mapImportRows(rows, input.mapping, { country: input.country })
    const { clusters } = clusterRecords(places.map((pl) => ({ ...pl, phones: pl.phones, websites: pl.websites, place: pl })))
    let created = 0
    let updated = 0
    for (let i = 0; i < clusters.length; i++) {
      if (i % 50 === 0) {
        if (!(await ctx.isActive())) throw new Error('Import annulé')
        await ctx.log(`${i}/${clusters.length} fiches enregistrées`, i / clusters.length)
      }
      const group = clusters[i]!.map((c) => c.place)
      const r = await persistCluster(group)
      if (r.created) created++
      else updated++
      const tags = [...new Set(group.flatMap((g) => g.tags))]
      if (tags.length) await sql()`update businesses set tags = (select array(select distinct unnest(tags || ${tags}::text[]))) where id = ${r.id}`
    }
    return { rows: rows.length, valid: places.length, invalid: errors.length, created, updated, errors: errors.slice(0, 200) }
  },

  async 'backup.run'(_p, ctx) {
    return runBackup(env().DATABASE_URL, (m) => ctx.log(m))
  },
}
