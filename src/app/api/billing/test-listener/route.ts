import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { assertSameOrigin } from '@/server/http/origin'
import { auditLog } from '@/server/core/audit'
import { getSecret } from '@/server/core/settings'
import { stripeForwardTarget, stripeTestListener } from '@/server/billing/test-listener'

export const runtime = 'nodejs'

export const GET = adminRoute(async () => stripeTestListener().status())
export const POST = adminRoute(async ({ req, body, admin }) => {
  await assertSameOrigin(req)
  const key = body.key || await getSecret('STRIPE_SECRET_KEY')
  const result = await stripeTestListener().start(key, stripeForwardTarget(req.url))
  await auditLog({ action: 'stripe.test_listener.start', actor: admin.email })
  return result
}, z.object({ key: z.string().trim().max(500).optional() }))
export const DELETE = adminRoute(async ({ req, admin }) => {
  await assertSameOrigin(req)
  const result = await stripeTestListener().stop()
  await auditLog({ action: 'stripe.test_listener.stop', actor: admin.email })
  return result
})
