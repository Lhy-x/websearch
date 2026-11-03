import {trashWebsite} from '@/server/sites/lifecycle'
import { z } from 'zod'
import { sql } from '@/server/core/db'
import { AppError } from '@/server/core/errors'
import { auditLog } from '@/server/core/audit'
import { getSettings } from '@/server/core/settings'
import { adminRoute } from '@/server/http/route'
import { enqueueJob } from '@/server/jobs/queue'
import { getWebsiteVersion, restoreWebsiteVersion, saveWebsiteVersion } from '@/server/sites/service'
import { exportSiteZip } from '@/server/sites/export'

export const GET = adminRoute(async ({ params, req }) => {
  const db = sql()
  const v = new URL(req.url).searchParams.get('version')
  const [site] = await db`select g.*, b.name business_name,b.email business_email from generated_websites g join businesses b on b.id = g.business_id where g.id = ${params.id}`
  if (!site) throw new AppError('Site introuvable', 404)
  const version = await getWebsiteVersion(params.id, v ? Number(v) : undefined)
  const versions = await db`select version, created_by, note, created_at from website_versions where website_id = ${params.id} order by version desc`
  const assets = await db`select kind, path, version, created_at from website_assets where website_id = ${params.id} order by created_at desc`
  const [proposal]=await db`select content from proposals where website_id=${params.id} order by created_at desc limit 1`
  return { site, version, versions, assets,proposal:proposal?.content??null }
})

const putSchema = z.object({ config: z.unknown(), baseVersion: z.number().int().optional(), note: z.string().max(200).optional() })

export const PUT = adminRoute(async ({ params, body }) => {
  const v = await saveWebsiteVersion(params.id, body.config, { baseVersion: body.baseVersion, note: body.note })
  await enqueueJob('website.capture', { websiteId: params.id }, { idempotencyKey: `capture:${params.id}:v${v}`, priority: 90 })
  return { version: v }
}, putSchema)

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('restore'), version: z.number().int().min(1) }),
  z.object({ action: z.literal('preview'), enabled: z.boolean() }),
  z.object({ action: z.literal('extend'), days: z.number().int().min(1).max(365) }),
  z.object({ action: z.literal('capture') }),
  z.object({ action: z.literal('revise'), instruction: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal('export'), includeMedia: z.boolean().default(true) }),
  z.object({ action: z.literal('delete') }),
  z.object({ action: z.literal('untrash') }),
])

export const POST = adminRoute(async ({ params, body }) => {
  const db = sql()
  switch (body.action) {
    case 'restore':
      return { version: await restoreWebsiteVersion(params.id, body.version) }
    case 'preview':
      await db`update generated_websites set preview_enabled = ${body.enabled}, status = case when ${body.enabled} and status = 'DISABLED' then 'READY' when not ${body.enabled} then 'DISABLED' else status end where id = ${params.id}`
      await auditLog({ action: body.enabled ? 'website.preview_enabled' : 'website.preview_disabled', entityType: 'website', entityId: params.id, actor: 'admin' })
      return { ok: true }
    case 'extend': {
      const s = await getSettings()
      await db`update generated_websites set preview_expires_at = greatest(coalesce(preview_expires_at, now()), now()) + ${body.days + ' days'}::interval where id = ${params.id}`
      return { ok: true, ttl: s.sites.previewTtlDays }
    }
    case 'capture':
      return { jobId: (await enqueueJob('website.capture', { websiteId: params.id }, { priority: 30 })).job.id }
    case 'revise':
      return { jobId: (await enqueueJob('website.revise', { websiteId: params.id, instruction: body.instruction }, { priority: 20, maxAttempts: 2 })).job.id }
    case 'export': {
      const v = await getWebsiteVersion(params.id)
      if (!v) throw new AppError('Aucune version', 404)
      const z = await exportSiteZip(v.config, { includeMedia: body.includeMedia })
      return new Response(new Uint8Array(z.buffer), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${z.filename}"`, 'x-export-warnings': encodeURIComponent(z.warnings.join(' | ')) } })
    }
    case 'delete':
      return trashWebsite(params.id)
    case 'untrash':
      return trashWebsite(params.id,true)
  }
}, actionSchema)
