import { z } from 'zod'
import { sql } from '@/server/core/db'
import { auditLog } from '@/server/core/audit'
import { AppError } from '@/server/core/errors'
import { SECRET_KEYS, getSettings, secretStatus, setSecret, updateSettings } from '@/server/core/settings'
import { adminRoute } from '@/server/http/route'
import { sendTestEmail } from '@/server/email/test-send'
import { suppress } from '@/server/email/suppression'
import { checkDmarc } from '@/server/email/dns-check'
import { cliStatus } from '@/server/ai/cli'
import { aiAvailability, generateStructured } from '@/server/ai/client'

export const GET = adminRoute(async () => ({ settings: await getSettings(), secrets: await secretStatus() }))

export const PUT = adminRoute(async ({ req, admin }) => {
  const patch = await req.json()
  const s = await updateSettings(patch)
  await auditLog({ action: 'settings.update', actor: admin.email, data: Object.keys(patch as object) })
  return s
})

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('secret'), key: z.enum(SECRET_KEYS), value: z.string().max(500).nullable() }),
  z.object({ action: z.literal('offer_save'), id: z.string().uuid().optional(), name: z.string().min(1).max(120), kind: z.enum(['vitrine', 'refonte', 'maintenance', 'seo_local', 'booking', 'custom']), description: z.string().max(2000), priceCents: z.number().int().min(0).nullable(), active: z.boolean().default(true) }),
  z.object({ action: z.literal('strategy_save'), id: z.string().uuid().optional(), name: z.string().min(1).max(120), instructions: z.string().min(1).max(4000), tone: z.string().max(60), isDefault: z.boolean().default(false) }),
  z.object({ action: z.literal('strategy_delete'), id: z.string().uuid() }),
  z.object({ action: z.literal('suppress'), value: z.string().min(3).max(320) }),
  z.object({ action: z.literal('unsuppress'), id: z.string().uuid() }),
  z.object({ action: z.literal('test_email'), to: z.string().email(), subject: z.string().min(1).max(200), body: z.string().min(1).max(5000) }),
  z.object({ action: z.literal('dns_check'), domain: z.string().min(3).max(253) }),
  z.object({ action: z.literal('ai_status') }),
  z.object({ action: z.literal('ai_test') }),
])

export const POST = adminRoute(async ({ body, admin }) => {
  const db = sql()
  switch (body.action) {
    case 'secret':
      await setSecret(body.key, body.value)
      await auditLog({ action: 'settings.secret', actor: admin.email, data: { key: body.key, set: !!body.value } })
      return { ok: true }
    case 'offer_save':
      if (body.id) await db`update sales_offers set name = ${body.name}, kind = ${body.kind}, description = ${body.description}, price_cents = ${body.priceCents}, active = ${body.active} where id = ${body.id}`
      else await db`insert into sales_offers (name, kind, description, price_cents, active) values (${body.name}, ${body.kind}, ${body.description}, ${body.priceCents}, ${body.active})`
      return { ok: true }
    case 'strategy_save':
      if (body.isDefault) await db`update prompt_strategies set is_default = false`
      if (body.id) await db`update prompt_strategies set name = ${body.name}, instructions = ${body.instructions}, tone = ${body.tone}, is_default = ${body.isDefault}, updated_at = now() where id = ${body.id}`
      else await db`insert into prompt_strategies (name, instructions, tone, is_default) values (${body.name}, ${body.instructions}, ${body.tone}, ${body.isDefault})`
      return { ok: true }
    case 'strategy_delete':
      await db`delete from prompt_strategies where id = ${body.id}`
      return { ok: true }
    case 'suppress': {
      const v = body.value.trim().toLowerCase()
      if (v.includes('@')) await suppress({ email: v, reason: 'MANUAL', source: 'settings' })
      else if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) await suppress({ domain: v, reason: 'MANUAL', source: 'settings' })
      else throw new AppError('Email ou domaine invalide', 400)
      return { ok: true }
    }
    case 'unsuppress':
      await db`delete from suppression_list where id = ${body.id}`
      await auditLog({ action: 'suppression.remove', actor: admin.email, level: 'warn', data: { id: body.id } })
      return { ok: true }
    case 'test_email':
      return sendTestEmail(body)
    case 'dns_check':
      return checkDmarc(body.domain)
    case 'ai_status': {
      const [claude, codex] = await Promise.all([cliStatus('claude-code', true), cliStatus('codex', true)])
      return { claude, codex, current: await aiAvailability() }
    }
    case 'ai_test': {
      const t = Date.now()
      const r = await generateStructured({ task: 'assistant', system: 'Réponds uniquement avec le JSON demandé.', instructions: 'Test de connexion : renvoie ok=true et le nom de ton modèle.', schema: z.object({ ok: z.boolean(), modele: z.string() }) })
      return { ok: r.data.ok, model: r.model, provider: r.provider, ms: Date.now() - t, costUsd: r.costUsd }
    }
  }
}, schema)
