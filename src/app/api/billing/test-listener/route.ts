import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { AppError } from '@/server/core/errors'
import { auditLog } from '@/server/core/audit'
import { getRuntimeConfig, getSecret } from '@/server/core/settings'
import { stripeForwardTarget, stripeTestListener } from '@/server/billing/test-listener'

export const runtime = 'nodejs'

async function checkOrigin(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin) return
  const allowed = [new URL(req.url).origin, new URL((await getRuntimeConfig()).APP_BASE_URL).origin]
  if (!allowed.includes(origin)) throw new AppError('Origine de la requête refusée', 403)
}

export const GET = adminRoute(async () => stripeTestListener().status())
export const POST = adminRoute(async ({ req, body, admin }) => {
  await checkOrigin(req)
  const key = body.key || await getSecret('STRIPE_SECRET_KEY')
  const result = await stripeTestListener().start(key, stripeForwardTarget(req.url))
  await auditLog({ action: 'stripe.test_listener.start', actor: admin.email })
  return result
}, z.object({ key: z.string().trim().max(500).optional() }))
export const DELETE = adminRoute(async ({ req, admin }) => {
  await checkOrigin(req)
  const result = await stripeTestListener().stop()
  await auditLog({ action: 'stripe.test_listener.stop', actor: admin.email })
  return result
})
