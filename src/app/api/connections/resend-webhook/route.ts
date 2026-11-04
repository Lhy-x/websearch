import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { assertSameOrigin } from '@/server/http/origin'
import { auditLog } from '@/server/core/audit'
import { createResendWebhook, resendWebhookStatus, setResendWebhookEnabled } from '@/server/email/resend-webhook'

export const runtime = 'nodejs'
export const GET = adminRoute(async () => resendWebhookStatus())
export const POST = adminRoute(async ({ req, body, admin }) => {
  await assertSameOrigin(req)
  const result = await createResendWebhook(body.base, body.key)
  await auditLog({ action: 'resend.webhook.configure', actor: admin.email, data: { id: result.webhook?.id, endpoint: result.webhook?.endpoint } })
  return result
}, z.object({ base: z.string().trim().min(1).max(2048), key: z.string().trim().max(500).optional() }))
export const PATCH = adminRoute(async ({ req, body, admin }) => {
  await assertSameOrigin(req)
  const result = await setResendWebhookEnabled(body.enabled)
  await auditLog({ action: body.enabled ? 'resend.webhook.enable' : 'resend.webhook.disable', actor: admin.email, data: { id: result.webhook?.id } })
  return result
}, z.object({ enabled: z.boolean() }))
