import { aiAvailability } from '@/server/ai/client'
import { z } from 'zod'
import { sql } from '@/server/core/db'
import { auditLog } from '@/server/core/audit'
import { AppError } from '@/server/core/errors'
import { normalizeName, normalizePhone } from '@/server/core/normalize'
import { adminRoute } from '@/server/http/route'
import { enqueueJob } from '@/server/jobs/queue'
import { getBusinessDetail } from '@/server/business/detail'
import { recomputeBusiness } from '@/server/business/recompute'
import { upsertContact } from '@/server/business/contacts'
import { mergeBusinesses } from '@/server/business/merge'
import { suppress } from '@/server/email/suppression'
import { PIPELINE } from '@/lib/labels'
import {refreshBusinessSummary} from '@/server/enrich/summary'

export const GET = adminRoute(async ({ params }) => {
  const d = await getBusinessDetail(params.id)
  if (!d) throw new AppError('Prospect introuvable', 404)
  return d
})

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sector: z.string().max(50).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  postcode: z.string().max(12).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  notes: z.string().max(10000).nullable().optional(),
  next_reminder_at: z.string().datetime().nullable().optional(),
})

/** Manual edits: always win over source data (sources only fill empty fields). */
export const PATCH = adminRoute(async ({ params, body }) => {
  const db = sql()
  const p = body as z.infer<typeof patchSchema>
  const fields: Record<string, unknown> = { ...p }
  if (p.name) fields.normalized_name = normalizeName(p.name)
  if (p.phone !== undefined) fields.phone = p.phone ? normalizePhone(p.phone) ?? (() => { throw new AppError('Numéro de téléphone invalide', 400) })() : null
  if (!Object.keys(fields).length) return { ok: true }
  await db`update businesses set ${db(fields as Record<string, never>)} where id = ${params.id}`
  await auditLog({ action: 'business.edit', entityType: 'business', entityId: params.id, actor: 'admin', data: Object.keys(fields) })
  await recomputeBusiness(params.id)
  await refreshBusinessSummary(params.id)
  return { ok: true }
}, patchSchema)

const actionSchema = z.discriminatedUnion('action', [
  z.object({action:z.literal('site_brief'),publicDetails:z.string().max(8000),artDirection:z.string().max(3000)}),
  z.object({ action: z.literal('enrich') }),
  z.object({ action: z.literal('audit') }),
  z.object({ action: z.literal('generate_site'), templateId: z.string().optional().nullable(), style: z.string().optional().nullable(), generator: z.enum(['auto', 'bespoke', 'ai', 'deterministic', 'glass3d', 'personalized']).default('personalized') }),
  z.object({ action: z.literal('proposal'), websiteId: z.string().uuid().optional().nullable(), offerId: z.string().uuid().optional().nullable(), strategyId: z.string().uuid().optional().nullable() }),
  z.object({ action: z.literal('set_status'), status: z.enum(PIPELINE.map((p) => p.id) as [string, ...string[]]) }),
  z.object({ action: z.literal('confirm_no_website'), note: z.string().max(300).optional() }),
  z.object({ action: z.literal('add_contact'), kind: z.enum(['email', 'phone', 'website', 'social']), value: z.string().min(3).max(500) }),
  z.object({ action: z.literal('contact_status'), contactId: z.string().uuid(), status: z.enum(['SOURCE_CONFIRMED', 'UNVERIFIED', 'INVALID']).optional(), primary: z.boolean().optional() }),
  z.object({ action: z.literal('note'), body: z.string().trim().min(1).max(10000) }),
  z.object({ action: z.literal('task'), title: z.string().trim().min(1).max(200), dueAt: z.string().datetime().nullable().optional() }),
  z.object({ action: z.literal('task_done'), taskId: z.string().uuid(), done: z.boolean() }),
  z.object({ action: z.literal('opportunity'), title: z.string().trim().min(1).max(200), amountCents: z.number().int().min(0).nullable().optional(), offerId: z.string().uuid().nullable().optional() }),
  z.object({ action: z.literal('opportunity_update'), opportunityId: z.string().uuid(), status: z.enum(['OPEN', 'WON', 'LOST']).optional(), amountCents: z.number().int().min(0).nullable().optional(), paidCents: z.number().int().min(0).nullable().optional() }),
  z.object({ action: z.literal('do_not_contact') }),
  z.object({ action: z.literal('merge'), otherId: z.string().uuid(), keep: z.enum(['this', 'other']) }),
  z.object({ action: z.literal('reject_merge'), mergeId: z.string().uuid() }),
  z.object({ action: z.literal('delete') }),
])

export const POST = adminRoute(async ({ params, body }) => {
  const db = sql()
  const id = params.id
  const a = body as z.infer<typeof actionSchema>
  switch (a.action) {
    case 'site_brief':
      await db`insert into business_enrichments(business_id,field,value,source,verified_at,confidence) values(${id},'site_brief',${db.json({publicDetails:a.publicDetails,artDirection:a.artDirection})},'manual',now(),1) on conflict(business_id,field,source) do update set value=excluded.value,verified_at=now(),retrieved_at=now()`
      await auditLog({action:'business.creative_brief',entityType:'business',entityId:id,actor:'admin'})
      await refreshBusinessSummary(id)
      return {ok:true}
    case 'enrich':
      return { jobId: (await enqueueJob('business.enrich', { businessIds: [id] }, { priority: 30 })).job.id }
    case 'audit':
      return { jobId: (await enqueueJob('business.audit', { businessId: id }, { priority: 30 })).job.id }
    case 'generate_site':
      if(a.generator === 'personalized') { const ai=await aiAvailability(); if(!ai.available) throw new AppError('Connectez Claude ou Codex dans Paramètres → IA avant de générer un site personnalisé. '+(ai.reason ?? ''),400,'AI_REQUIRED') }
      return { jobId: (await enqueueJob('website.generate', { businessId: id, templateId: a.templateId, style: a.style, generator: a.generator }, { priority: 20 })).job.id }
    case 'proposal':
      return { jobId: (await enqueueJob('proposal.generate', { businessId: id, websiteId: a.websiteId, offerId: a.offerId, strategyId: a.strategyId }, { priority: 20 })).job.id }
    case 'set_status':
      await db`update businesses set pipeline_status = ${a.status}, do_not_contact = ${a.status === 'DO_NOT_CONTACT'} or do_not_contact where id = ${id}`
      await auditLog({ action: 'business.status', entityType: 'business', entityId: id, actor: 'admin', data: { to: a.status } })
      if (['WON', 'LOST', 'DO_NOT_CONTACT'].includes(a.status))
        await db`update campaign_prospects set status = 'STOPPED', stop_reason = ${'statut ' + a.status}, next_send_at = null where business_id = ${id} and status in ('PENDING','APPROVED','ACTIVE')`
      return { ok: true }
    case 'confirm_no_website':
      await db`update businesses set web_presence_evidence = web_presence_evidence || ${db.json([{ source: 'manual', at: new Date().toISOString(), finding: 'manual_no_website', live: true, detail: a.note ?? 'Vérification manuelle' }] as never)} where id = ${id}`
      await auditLog({ action: 'business.confirm_no_website', entityType: 'business', entityId: id, actor: 'admin', data: { note: a.note } })
      await recomputeBusiness(id)
      return { ok: true }
    case 'add_contact':
      if (!(await upsertContact(id, { kind: a.kind, value: a.value, source: 'manual', status: 'SOURCE_CONFIRMED', confidence: 1 }))) throw new AppError('Valeur invalide pour ce type de contact', 400)
      await recomputeBusiness(id)
      return { ok: true }
    case 'contact_status':
      if (a.primary) {
        const [c] = await db<{ kind: string }[]>`select kind from business_contacts where id = ${a.contactId} and business_id = ${id}`
        await db`update business_contacts set is_primary = (id = ${a.contactId}) where business_id = ${id} and kind = ${c?.kind ?? ''}`
      }
      if (a.status) await db`update business_contacts set status = ${a.status}, verified_at = now() where id = ${a.contactId} and business_id = ${id}`
      await recomputeBusiness(id)
      return { ok: true }
    case 'note':
      await db`insert into crm_notes (business_id, body) values (${id}, ${a.body})`
      return { ok: true }
    case 'task':
      await db`insert into crm_tasks (business_id, title, due_at) values (${id}, ${a.title}, ${a.dueAt ?? null})`
      return { ok: true }
    case 'task_done':
      await db`update crm_tasks set done_at = ${a.done ? new Date() : null} where id = ${a.taskId} and business_id = ${id}`
      return { ok: true }
    case 'opportunity':
      await db`insert into crm_opportunities (business_id, title, amount_cents, offer_id) values (${id}, ${a.title}, ${a.amountCents ?? null}, ${a.offerId ?? null})`
      await db`update businesses set pipeline_status = 'NEGOTIATION' where id = ${id} and pipeline_status in ('REPLIED','INTERESTED','MEETING_BOOKED','CONTACTED')`
      return { ok: true }
    case 'opportunity_update': {
      const set: Record<string, unknown> = {}
      if (a.status) set.status = a.status
      if (a.status === 'WON') set.signed_at = new Date()
      if (a.amountCents !== undefined) set.amount_cents = a.amountCents
      if (a.paidCents !== undefined) {
        set.paid_cents = a.paidCents
        set.paid_at = a.paidCents ? new Date() : null
      }
      if (Object.keys(set).length) await db`update crm_opportunities set ${db(set as Record<string, never>)} where id = ${a.opportunityId} and business_id = ${id}`
      if (a.status === 'WON' || a.status === 'LOST') {
        await db`update businesses set pipeline_status = ${a.status} where id = ${id}`
        await auditLog({ action: 'business.status', entityType: 'business', entityId: id, actor: 'admin', data: { to: a.status } })
        await db`update campaign_prospects set status = 'STOPPED', stop_reason = ${'opportunité ' + a.status}, next_send_at = null where business_id = ${id} and status in ('PENDING','APPROVED','ACTIVE')`
      }
      return { ok: true }
    }
    case 'do_not_contact': {
      const [b] = await db<{ email: string | null }[]>`select email from businesses where id = ${id}`
      await suppress({ email: b?.email ?? null, businessId: id, reason: 'OPPOSITION', source: 'admin' })
      return { ok: true }
    }
    case 'merge':
      if (a.keep === 'this') await mergeBusinesses(id, a.otherId)
      else await mergeBusinesses(a.otherId, id)
      await db`update business_merges set status = 'MERGED', decided_at = now() where status = 'PENDING' and ((primary_id = ${id} and candidate_id = ${a.otherId}) or (primary_id = ${a.otherId} and candidate_id = ${id}))`
      return { ok: true, keptId: a.keep === 'this' ? id : a.otherId }
    case 'reject_merge':
      await db`update business_merges set status = 'REJECTED', decided_at = now() where id = ${a.mergeId}`
      return { ok: true }
    case 'delete':
      await db`delete from businesses where id = ${id}`
      await auditLog({ action: 'business.delete', actor: 'admin', data: { id } })
      return { ok: true }
  }
}, actionSchema)
