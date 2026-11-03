import {adminRoute} from '@/server/http/route'
import {billingSetup} from '@/server/billing/stripe'
import {secretStatus} from '@/server/core/settings'
export const GET=adminRoute(async()=>{const [billing,secrets]=await Promise.all([billingSetup(),secretStatus()]);return {...billing,keyConfigured:secrets.STRIPE_SECRET_KEY!=='missing',webhookConfigured:secrets.STRIPE_WEBHOOK_SECRET!=='missing'}})
