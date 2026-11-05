import {adminRoute} from '@/server/http/route'
import {billingSetup,stripeCredentials} from '@/server/billing/stripe'
import {secretStatus} from '@/server/core/settings'
import {checkoutDiagnostics} from '@/server/billing/checkout-errors'
export const GET=adminRoute(async()=>{const [billing,test,live,diagnostics]=await Promise.all([billingSetup(),stripeCredentials(false),stripeCredentials(true),checkoutDiagnostics()]);return {...billing,diagnostics,keyConfigured:!!(billing.live?live.key:test.key),webhookConfigured:!!(billing.live?live.webhook:test.webhook),credentials:{test:{keyConfigured:!!test.key,webhookConfigured:!!test.webhook},live:{keyConfigured:!!live.key,webhookConfigured:!!live.webhook}}}})
