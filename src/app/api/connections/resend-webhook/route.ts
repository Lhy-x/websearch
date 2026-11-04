import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { AppError } from '@/server/core/errors'
import { auditLog } from '@/server/core/audit'
import { getRuntimeConfig } from '@/server/core/settings'
import { createResendWebhook, resendWebhookStatus, setResendWebhookEnabled } from '@/server/email/resend-webhook'

export const runtime = 'nodejs'
async function checkOrigin(req: Request) {
  const origin = req.headers.get('origin')
  if (origin && ![new URL(req.url).origin, new URL((await getRuntimeConfig()).APP_BASE_URL).origin].includes(origin)) throw new AppError('Origine de la requête refusée', 403)
}
export const GET = adminRoute(async () => resendWebhookStatus())
export const POST = adminRoute(async ({ req, body, admin }) => {
  await checkOrigin(req)
  const result = await createResendWebhook(body.base, body.key)
  await auditLog({ action: 'resend.webhook.configure', actor: admin.email, data: { id: result.webhook?.id, endpoint: result.webhook?.endpoint } })
  return result
}, z.object({ base: z.string().trim().min(1).max(2048), key: z.string().trim().max(500).optional() }))
export const PATCH = adminRoute(async ({ req, body, admin }) => {
  await checkOrigin(req)
  const result = await setResendWebhookEnabled(body.enabled)
  await auditLog({ action: body.enabled ? 'resend.webhook.enable' : 'resend.webhook.disable', actor: admin.email, data: { id: result.webhook?.id } })
  return result
}, z.object({ enabled: z.boolean() }))
