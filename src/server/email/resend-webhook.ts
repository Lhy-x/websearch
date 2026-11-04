import { z } from 'zod'
import { createHash } from 'node:crypto'
import { RESEND_WEBHOOK_EVENTS, type ResendWebhookStatus } from '@/lib/resend-webhook'
import { sql, type Sql } from '../core/db'
import { encryptSecret } from '../core/crypto'
import { AppError } from '../core/errors'
import { assertSafeUrl } from '../core/safe-fetch'
import { getRuntimeConfig, getSecret, secretStatus } from '../core/settings'

const RECORD_KEY = 'resend:webhook'
const fingerprint = (key: string) => createHash('sha256').update(key).digest('hex')
const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/)
const secretSchema = z.string().regex(/^whsec_[A-Za-z0-9+/=_-]{16,}$/)
const recordSchema = z.object({ id: idSchema, endpoint: z.string().url(), status: z.enum(['enabled', 'disabled']), updatedAt: z.string(), keyFingerprint: z.string() })
type RecordValue = z.infer<typeof recordSchema>

export function resendWebhookEndpoint(base: string): string {
  try {
    const url = assertSafeUrl(base.trim())
    if (url.protocol !== 'https:' || url.search || url.hash || !['/', '/api/webhooks/resend'].includes(url.pathname) || (!url.hostname.includes('.') && !url.hostname.startsWith('['))) throw new Error('Adresse publique requise')
    return `${url.origin}/api/webhooks/resend`
  } catch {
    throw new AppError('Resend a besoin d’une adresse HTTPS publique. Sur Mac, utilisez l’adresse d’un tunnel vers votre application ; localhost ne peut pas recevoir ces événements.', 400, 'PUBLIC_URL_REQUIRED')
  }
}

async function resendRequest(key: string, method: 'GET' | 'POST' | 'PATCH', route: string, body?: unknown, attempt = 0): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`https://api.resend.com${route}`, {
      method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch { throw new AppError('Connexion à Resend impossible. Vérifiez votre connexion puis réessayez.', 502) }
  if (response.status === 401 || response.status === 403) throw new AppError('Resend refuse cette clé ou ses autorisations. Utilisez une clé « Full access » pour gérer les webhooks ; une clé limitée à l’envoi ne suffit pas.', 412, 'RESEND_PERMISSIONS_REQUIRED')
  if (response.status === 404) throw new AppError('Ce webhook est introuvable chez Resend. Cliquez sur créer le webhook pour le reconfigurer.', 404)
  if (response.status === 429) {
    const header = response.headers.get('retry-after')
    const delay = header ? (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 1000
    await response.body?.cancel()
    if (attempt < 2 && Number.isFinite(delay) && delay <= 5000) {
      await new Promise(resolve => setTimeout(resolve, Math.max(1000, delay)))
      return resendRequest(key, method, route, body, attempt + 1)
    }
    throw new AppError('Resend limite les requêtes. Patientez un instant avant de réessayer.', 429)
  }
  if (!response.ok) throw new AppError(`Resend n’a pas accepté la configuration (HTTP ${response.status}). Vérifiez l’adresse publique et les webhooks dans votre compte.`, 502)
  const parsed = await response.json().catch(() => null)
  if (!parsed || typeof parsed !== 'object') throw new AppError('Réponse de Resend invalide. Réessayez ; les clés existantes sont conservées.', 502)
  return parsed as Record<string, unknown>
}

async function readRecord(db: Pick<Sql, 'unsafe'> = sql()): Promise<RecordValue | null> {
  const [row] = await db.unsafe('select value from kv_store where key=$1', [RECORD_KEY])
  const result = recordSchema.safeParse(row?.value)
  return result.success ? result.data : null
}

export async function resendWebhookStatus(): Promise<ResendWebhookStatus> {
  const [record, secrets, runtime] = await Promise.all([readRecord(), secretStatus(), getRuntimeConfig()])
  let defaultBase = ''
  try { defaultBase = new URL(resendWebhookEndpoint(runtime.APP_BASE_URL)).origin } catch { /* local application: ask for a public tunnel */ }
  return {
    keyConfigured: secrets.RESEND_API_KEY !== 'missing', secretConfigured: secrets.RESEND_WEBHOOK_SECRET !== 'missing', defaultBase,
    webhook: record ? { id: record.id, endpoint: record.endpoint, status: record.status, updatedAt: record.updatedAt } : null,
  }
}

async function findExisting(key: string, endpoint: string): Promise<string | null> {
  let after: string | undefined
  for (let page = 0; page < 10; page++) {
    const list = await resendRequest(key, 'GET', `/webhooks?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`)
    const parsed = z.object({ data: z.array(z.object({ id: idSchema, endpoint: z.string() })), has_more: z.boolean() }).safeParse(list)
    if (!parsed.success) throw new AppError('Liste des webhooks Resend invalide. Aucune clé modifiée.', 502)
    const found = parsed.data.data.find(item => item.endpoint === endpoint)
    if (found) return found.id
    if (!parsed.data.has_more) return null
    after = parsed.data.data.at(-1)?.id
    if (!after) break
  }
  throw new AppError('Impossible de parcourir tous les webhooks. Vérifiez votre liste dans Resend avant de réessayer.', 502)
}

function checkKey(key: string) {
  if (!/^re_[A-Za-z0-9_-]+$/.test(key)) throw new AppError('Ajoutez votre clé API Resend re_… avec les droits « Full access ».', 400)
}

export async function createResendWebhook(base: string, newKey?: string) {
  const endpoint = resendWebhookEndpoint(base)
  const key = newKey?.trim() || await getSecret('RESEND_API_KEY')
  checkKey(key)
  await sql().begin(async tx => {
    const [lock] = await tx`select pg_try_advisory_xact_lock(1672849302) locked`
    if (!lock?.locked) throw new AppError('Une configuration Resend est déjà en cours. Réessayez dans un instant.', 409)
    let id = await findExisting(key, endpoint)
    let secret: string
    if (id) {
      const existing = await resendRequest(key, 'GET', `/webhooks/${encodeURIComponent(id)}`)
      const details = z.object({ id: idSchema, endpoint: z.literal(endpoint), signing_secret: secretSchema, events: z.array(z.string()).nullable(), status: z.enum(['enabled', 'disabled']) }).safeParse(existing)
      if (!details.success) throw new AppError('Le webhook existant ne peut pas être récupéré. Aucune clé modifiée.', 502)
      secret = details.data.signing_secret
      if (details.data.status !== 'enabled' || RESEND_WEBHOOK_EVENTS.some(event => !details.data.events?.includes(event))) {
        await resendRequest(key, 'PATCH', `/webhooks/${encodeURIComponent(id)}`, { status: 'enabled', events: [...new Set([...(details.data.events ?? []), ...RESEND_WEBHOOK_EVENTS])] })
      }
    } else {
      const created = await resendRequest(key, 'POST', '/webhooks', { endpoint, events: RESEND_WEBHOOK_EVENTS })
      const result = z.object({ id: idSchema, signing_secret: secretSchema }).safeParse(created)
      if (!result.success) throw new AppError('Resend n’a pas renvoyé le secret attendu. Réessayez : le webhook pourra être récupéré sans doublon.', 502)
      id = result.data.id; secret = result.data.signing_secret
    }
    const record: RecordValue = { id, endpoint, status: 'enabled', updatedAt: new Date().toISOString(), keyFingerprint: fingerprint(key) }
    await tx`update admin_settings set secrets=secrets || ${tx.json({ RESEND_API_KEY: encryptSecret(key), RESEND_WEBHOOK_SECRET: encryptSecret(secret) })},updated_at=now() where id=1`
    await tx`insert into kv_store(key,value) values(${RECORD_KEY},${tx.json(record)}) on conflict(key) do update set value=excluded.value,updated_at=now()`
  })
  return resendWebhookStatus()
}

export async function setResendWebhookEnabled(enabled: boolean) {
  const key = await getSecret('RESEND_API_KEY')
  checkKey(key)
  await sql().begin(async tx => {
    const [lock] = await tx`select pg_try_advisory_xact_lock(1672849302) locked`
    if (!lock?.locked) throw new AppError('Une configuration Resend est déjà en cours. Réessayez dans un instant.', 409)
    const record = await readRecord(tx as unknown as Sql)
    if (!record) throw new AppError('Créez d’abord un webhook depuis cette application.', 400)
    if (record.keyFingerprint !== fingerprint(key)) throw new AppError('La clé Resend a changé. Recréez la configuration pour vérifier le bon compte avant de modifier ce webhook.', 409)
    const existing = await resendRequest(key, 'GET', `/webhooks/${encodeURIComponent(record.id)}`)
    if (existing.endpoint !== record.endpoint) throw new AppError('L’adresse du webhook a changé chez Resend. Reconfigurez-le avant de modifier son état.', 409)
    const status = enabled ? 'enabled' : 'disabled'
    await resendRequest(key, 'PATCH', `/webhooks/${encodeURIComponent(record.id)}`, { status })
    await tx`update kv_store set value=${tx.json({ ...record, status, updatedAt: new Date().toISOString() })},updated_at=now() where key=${RECORD_KEY}`
  })
  return resendWebhookStatus()
}
