import { AppError } from '@/server/core/errors'
import { aiAvailability } from '@/server/ai/client'
import { z } from 'zod'
import { sql } from '@/server/core/db'
import { auditLog } from '@/server/core/audit'
import { adminRoute } from '@/server/http/route'
import { enqueueJob } from '@/server/jobs/queue'
import { addProspects } from '@/server/campaigns/service'
import { recomputeBusiness } from '@/server/business/recompute'
import { suppress } from '@/server/email/suppression'

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
  action: z.enum(['enrich', 'generate_site', 'add_to_campaign', 'tag', 'untag', 'archive', 'unarchive', 'set_status', 'do_not_contact', 'rescore', 'delete']),
  campaignId: z.string().uuid().optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  status: z.string().optional(),
  templateId: z.string().optional(),
  style: z.string().optional(),
  generator: z.enum(['auto', 'bespoke', 'ai', 'deterministic', 'glass3d', 'personalized']).optional(),
})

/** Bulk actions. Long work is enqueued as jobs; quick DB updates are applied directly. */
export const POST = adminRoute(async ({ body }) => {
  const db = sql()
  const ids = body.ids
  switch (body.action) {
    case 'enrich': {
      const jobs = []
      for (let i = 0; i < ids.length; i += 50) jobs.push((await enqueueJob('business.enrich', { businessIds: ids.slice(i, i + 50) }, { priority: 60 })).job.id)
      return { queued: jobs.length, jobIds: jobs }
    }
    case 'generate_site': {
      if((body.generator ?? 'personalized') === 'personalized') { const ai=await aiAvailability(); if(!ai.available) throw new AppError('Connectez Claude ou Codex dans Paramètres → IA avant de générer un site personnalisé. '+(ai.reason ?? ''),400,'AI_REQUIRED') }
      const jobIds = []
      for (const id of ids.slice(0, 200)) jobIds.push((await enqueueJob('website.generate', { businessId: id, templateId: body.templateId ?? null, style: body.style ?? null, generator: body.generator ?? 'personalized' }, { priority: 40, maxAttempts: 2 })).job.id)
      return { queued: jobIds.length, jobIds }
    }
    case 'add_to_campaign':
      if (!body.campaignId) throw new Error('campaignId requis')
      return addProspects(body.campaignId, ids)
    case 'tag':
      await db`update businesses set tags = (select array(select distinct unnest(tags || ${[body.tag!]}::text[]))) where id = any(${ids}::uuid[])`
      return { updated: ids.length }
    case 'untag':
      await db`update businesses set tags = array_remove(tags, ${body.tag!}) where id = any(${ids}::uuid[])`
      return { updated: ids.length }
    case 'archive':
      await db`update businesses set archived_at = now() where id = any(${ids}::uuid[])`
      return { updated: ids.length }
    case 'unarchive':
      await db`update businesses set archived_at = null where id = any(${ids}::uuid[])`
      return { updated: ids.length }
    case 'set_status':
      await db`update businesses set pipeline_status = ${body.status!} where id = any(${ids}::uuid[])`
      for (const id of ids) await auditLog({ action: 'business.status', entityType: 'business', entityId: id, actor: 'admin', data: { to: body.status } })
      return { updated: ids.length }
    case 'do_not_contact':
      for (const id of ids) {
        const [b] = await db<{ email: string | null }[]>`select email from businesses where id = ${id}`
        await suppress({ email: b?.email ?? null, businessId: id, reason: 'OPPOSITION', source: 'admin' })
      }
      return { updated: ids.length }
    case 'rescore':
      for (const id of ids) await recomputeBusiness(id)
      return { updated: ids.length }
    case 'delete':
      // RGPD erasure: the suppression list keeps the opposition if any, everything else is removed
      await db`delete from businesses where id = any(${ids}::uuid[])`
      await auditLog({ action: 'business.delete', actor: 'admin', data: { count: ids.length } })
      return { deleted: ids.length }
  }
}, schema)
