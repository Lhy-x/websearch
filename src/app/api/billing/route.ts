import {adminRoute} from '@/server/http/route'
import {billingSetup,stripeCredentials} from '@/server/billing/stripe'
import {secretStatus} from '@/server/core/settings'
export const GET=adminRoute(async()=>{const [billing,test,live]=await Promise.all([billingSetup(),stripeCredentials(false),stripeCredentials(true)]);return {...billing,keyConfigured:!!(billing.live?live.key:test.key),webhookConfigured:!!(billing.live?live.webhook:test.webhook),credentials:{test:{keyConfigured:!!test.key,webhookConfigured:!!test.webhook},live:{keyConfigured:!!live.key,webhookConfigured:!!live.webhook}}}})
