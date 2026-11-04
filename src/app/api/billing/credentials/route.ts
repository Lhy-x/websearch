import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { assertSameOrigin } from '@/server/http/origin'
import { setSecret } from '@/server/core/settings'
import { AppError } from '@/server/core/errors'
import { auditLog } from '@/server/core/audit'
export const POST=adminRoute(async({req,body,admin})=>{
 await assertSameOrigin(req)
 if(body.key&&!new RegExp(`^(sk|rk)_${body.mode}_`).test(body.key))throw new AppError(`Cette section nécessite une clé Stripe ${body.mode==='live'?'réelle sk_live_…':'de test sk_test_…'}`,400)
 if(body.webhook&&!/^whsec_[A-Za-z0-9_]+$/.test(body.webhook))throw new AppError('Secret de webhook Stripe invalide',400)
 if(body.key)await setSecret(body.mode==='live'?'STRIPE_SECRET_KEY':'STRIPE_TEST_SECRET_KEY',body.key)
 if(body.webhook)await setSecret(body.mode==='live'?'STRIPE_WEBHOOK_SECRET':'STRIPE_TEST_WEBHOOK_SECRET',body.webhook)
 await auditLog({action:'billing.credentials',actor:admin.email,data:{mode:body.mode,key:!!body.key,webhook:!!body.webhook}})
 return {ok:true}
},z.object({mode:z.enum(['test','live']),key:z.string().trim().max(500).optional(),webhook:z.string().trim().max(500).optional()}))
