import {beforeEach,afterAll,it,expect,vi} from 'vitest'
import Stripe from 'stripe'
import {sql,closeDb} from '@/server/core/db'
import {updateSettings} from '@/server/core/settings'
import {resetEnvCache} from '@/server/core/env'
import {resetDb,insertTestBusiness} from './helpers'
import {generateWebsite,lookupPreview,getWebsiteVersion,saveWebsiteVersion} from '@/server/sites/service'
import {createCheckout,processStripeEvent,purchaseConfig,verifiedStripeEvent} from '@/server/billing/orders'
import {billingSetup} from '@/server/billing/stripe'
import {trashWebsite} from '@/server/sites/lifecycle'
import {generateProposal} from '@/server/proposals/service'
import type {SiteConfig} from '@/lib/site/schema'
const mocks=vi.hoisted(()=>({create:vi.fn(),retrieve:vi.fn(),expire:vi.fn(),taxRate:vi.fn(async(id:string)=>({id,active:true,inclusive:true}))}))
vi.mock('@/server/billing/stripe',async importOriginal=>{const actual=await importOriginal<typeof import('@/server/billing/stripe')>();const {default:Stripe}=await import('stripe');return {...actual,stripeClient:async()=>({checkout:{sessions:mocks},taxRates:{retrieve:mocks.taxRate},webhooks:new Stripe('sk_test_fake_only').webhooks})}})
beforeEach(async()=>{await resetDb();process.env.STRIPE_SECRET_KEY='sk_test_fake_only';process.env.STRIPE_WEBHOOK_SECRET='whsec_fake_only';resetEnvCache();await updateSettings({commerce:{enabled:true,priceCents:19900},sites:{previewBaseUrl:'http://localhost:3999'}});mocks.create.mockReset();mocks.retrieve.mockReset();mocks.expire.mockReset();mocks.create.mockImplementation(async(_p,opts)=>({id:'cs_test_'+opts.idempotencyKey.split(':')[1],url:'https://checkout.stripe.com/c/pay/test'}));mocks.retrieve.mockResolvedValue({status:'open',url:'https://checkout.stripe.com/c/pay/test'});mocks.expire.mockResolvedValue({status:'expired'})})
afterAll(async()=>{delete process.env.STRIPE_SECRET_KEY;delete process.env.STRIPE_WEBHOOK_SECRET;resetEnvCache();await closeDb()})
async function site(){return generateWebsite(await insertTestBusiness(),{generator:'deterministic'})}
async function order(){return (await sql()`select * from website_orders order by created_at desc limit 1`)[0]!}
function event(o:Awaited<ReturnType<typeof order>>,id='evt_paid',extra:Record<string,unknown>={}):Stripe.Event{return {id,type:'checkout.session.completed',livemode:false,data:{object:{id:o.stripe_session_id,metadata:{order_id:o.id},currency:'eur',amount_total:19900,payment_status:'paid',invoice:'in_test',...extra}}} as unknown as Stripe.Event}

it('creates one fixed-price Checkout with invoice creation, reuses concurrent clicks and grants nothing before webhook',async()=>{
 await updateSettings({commerce:{taxRateId:'txr_test'}})
 const g=await site();await Promise.all([createCheckout(g.previewToken),createCheckout(g.previewToken)])
 expect(await sql()`select id from website_orders`).toHaveLength(1)
 const o=await order();const params=mocks.create.mock.calls[0]![0]
 expect(params.invoice_creation).toMatchObject({enabled:true,invoice_data:{metadata:{order_id:o.id}}})
 expect(params.managed_payments).toEqual({enabled:false})
 expect(params.line_items[0].tax_rates).toEqual(['txr_test']);expect(params.line_items[0].price_data.tax_behavior).toBe('inclusive')
 expect(params.billing_address_collection).toBe('required');expect(params.line_items[0].price_data.unit_amount).toBe(19900)
 expect(params.success_url).not.toContain('paid=true')
 const {POST}=await import('@/app/buy/[token]/checkout/route')
 const ctx={params:Promise.resolve({token:g.previewToken})}
 expect((await POST(new Request('http://127.0.0.1:3000/buy/demo/checkout',{method:'POST',headers:{origin:'http://localhost:3999','sec-fetch-site':'same-origin'}}),ctx)).status).toBe(303)
 expect((await POST(new Request('http://127.0.0.1:3000/buy/demo/checkout',{method:'POST',headers:{origin:'https://unrelated.example','sec-fetch-site':'cross-site'}}),ctx)).status).toBe(403)
 await expect(purchaseConfig(o.access_token)).rejects.toThrow('Paiement non confirmé')
 await processStripeEvent(event(o));await processStripeEvent(event(o));expect((await order()).status).toBe('PAID')
 expect(await sql()`select id from crm_opportunities`).toHaveLength(0) // Test mode is never real revenue.
 await expect(createCheckout(g.previewToken)).rejects.toThrow('déjà été réglé')
 const config=await purchaseConfig(o.access_token);expect(config).toBeTruthy()
 const changed=structuredClone(config) as SiteConfig;changed.hero.title='Nouvelle version';await saveWebsiteVersion(g.websiteId,changed)
 expect((await purchaseConfig(o.access_token) as SiteConfig).hero.title).not.toBe('Nouvelle version')
})
it('validates Stripe signatures, rejects amount and mode mismatches, handles delayed payments and out-of-order invoices',async()=>{
 const g=await site();await createCheckout(g.previewToken);const o=await order()
 await expect(processStripeEvent(event(o,'bad',{amount_total:1}))).rejects.toThrow('Montant')
 const wrongMode=event(o,'bad_mode');wrongMode.livemode=true
 await expect(processStripeEvent(wrongMode)).rejects.toThrow('Mode Stripe incohérent')
 await processStripeEvent(event(o,'evt_pending',{payment_status:'unpaid'}));expect((await order()).status).toBe('PENDING')
 const invoice={id:'evt_invoice',type:'invoice.paid',livemode:false,data:{object:{id:'in_test',metadata:{order_id:o.id},currency:'eur',total:19900,hosted_invoice_url:'https://invoice.stripe.com/i/test',invoice_pdf:'https://pay.stripe.com/invoice/test/pdf'}}} as unknown as Stripe.Event
 await processStripeEvent(invoice);expect((await order()).status).toBe('PENDING')
 const paid=event(o,'evt_async');paid.type='checkout.session.async_payment_succeeded';await processStripeEvent(paid)
 expect((await order()).invoice_url).toContain('invoice.stripe.com')
 const stripe=new Stripe('sk_test_fake_only');const raw=JSON.stringify(event(o,'evt_signature'));const header=Stripe.webhooks.generateTestHeaderString({payload:raw,secret:'whsec_fake_only'})
 expect((await verifiedStripeEvent(raw,header)).id).toBe('evt_signature')
 await expect(verifiedStripeEvent(raw+' ',header)).rejects.toThrow('Signature')
})
it('requires public HTTPS for live sales, records a live sale once and keeps paid delivery after trash',async()=>{
 process.env.STRIPE_SECRET_KEY='sk_live_fake_only';resetEnvCache();await updateSettings({launch:{mode:'live'}},{allowModeChange:true});expect((await billingSetup()).ready).toBe(false)
 await updateSettings({sites:{previewBaseUrl:'https://demo.example.test'}})
 const g=await site();await createCheckout(g.previewToken);const o=await order();const live=event(o);live.livemode=true
 await processStripeEvent(live);await processStripeEvent(live)
 expect(await sql()`select id from crm_opportunities where status='WON' and paid_cents=19900`).toHaveLength(1)
 await trashWebsite(g.websiteId);expect((await lookupPreview(g.previewToken)).status).toBe('not_found');expect(await purchaseConfig(o.access_token)).toBeTruthy()
 await trashWebsite(g.websiteId,true);expect((await lookupPreview(g.previewToken)).status).toBe('ok')
})
it('expires an open Checkout before trash and includes the current price/payment URL in generated emails',async()=>{
 const g=await site();const r=await generateProposal({businessId:(await sql()`select business_id from generated_websites where id=${g.websiteId}`)[0]!.business_id,websiteId:g.websiteId,generator:'deterministic'})
 expect(r.content.initial.body).toContain('/buy/'+g.previewToken);expect(r.content.initial.body).toContain('199')
 await createCheckout(g.previewToken);await trashWebsite(g.websiteId);expect(mocks.expire).toHaveBeenCalledOnce();expect((await order()).status).toBe('EXPIRED')
 await expect(createCheckout(g.previewToken)).rejects.toThrow('disponible')
})
