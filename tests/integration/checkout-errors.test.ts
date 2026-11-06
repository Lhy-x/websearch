import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest'
import Stripe from 'stripe'
import {resetDb,insertTestBusiness} from './helpers'
import {closeDb,sql} from '@/server/core/db'
import {setSecret,updateSettings} from '@/server/core/settings'
import {createCheckout,syncOrderFromStripe} from '@/server/billing/orders'
import {generateWebsite} from '@/server/sites/service'
import {checkoutDiagnostics,checkoutFailure,redactStripeDetail} from '@/server/billing/checkout-errors'

let capture:ReturnType<typeof vi.spyOn>
beforeEach(async()=>{
 await resetDb()
 await setSecret('STRIPE_TEST_SECRET_KEY','sk_test_checkout_fixture')
 await setSecret('STRIPE_TEST_WEBHOOK_SECRET','whsec_checkout_fixture')
 await updateSettings({commerce:{enabled:true,priceCents:19900},sites:{previewBaseUrl:'http://localhost:3999'}})
 capture=vi.spyOn(console,'error').mockImplementation(()=>{})
})
afterEach(()=>{vi.unstubAllGlobals();capture.mockRestore()})
afterAll(closeDb)
async function site(){return generateWebsite(await insertTestBusiness(),{generator:'deterministic'})}
function offlineStripe(respond:(form:URLSearchParams)=>Response){
 const fetcher=vi.fn(async(input:unknown,init?:RequestInit)=>{
  expect(String(input)).toMatch(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions/)
  expect(new Headers(init?.headers).has('content-length')).toBe(false)
  return respond(new URLSearchParams(String(init?.body??'')))
 })
 vi.stubGlobal('fetch',fetcher)
 return fetcher
}
const accepted=()=>Response.json({id:'cs_fixture_checkout',url:'https://checkout.stripe.com/c/fixture'}, {headers:{'request-id':'req_successfixture'}})

it('records a real SDK request refusal privately, marks the intent failed, and retries after correction without dropping invoices',async()=>{
 const generated=await site()
 const fetcher=offlineStripe(()=>Response.json({error:{type:'invalid_request_error',message:'Your business name must be set before accepting payments. See https://dashboard.stripe.com/settings.',param:'business_profile[name]'}},{status:400,headers:{'request-id':'req_profilefixture'}}))
 await expect(createCheckout(generated.previewToken)).rejects.toMatchObject({status:502,code:'STRIPE_BUSINESS_PROFILE'})
 const diagnostic=(await checkoutDiagnostics()).test
 expect(diagnostic).toMatchObject({category:'business_profile',requestId:'req_profilefixture',parameter:'business_profile[name]'})
 expect(diagnostic!.detail).not.toContain('https://')
 expect((await sql()`select status from website_orders`)[0]!.status).toBe('FAILED')
 fetcher.mockImplementation(async(_input,init)=>{
  const form=new URLSearchParams(String(init?.body??''))
  expect(form.get('invoice_creation[enabled]')).toBe('true')
  expect(form.get('customer_creation')).toBe('always')
  expect(form.get('line_items[0][price_data][unit_amount]')).toBe('19900')
  return accepted()
 })
 expect(await createCheckout(generated.previewToken)).toContain('checkout.stripe.com')
 expect((await checkoutDiagnostics()).test).toBeNull()
 expect(await sql()`select status from website_orders order by created_at`).toMatchObject([{status:'FAILED'},{status:'OPEN'}])
})

it('preserves the checkout body, frozen price and idempotency key after a temporary Stripe failure',async()=>{
 const generated=await site()
 const requests:{body:unknown;idempotency:string|null}[]=[]
 let success=false
 vi.stubGlobal('fetch',vi.fn(async(_input,init:RequestInit)=>{
  requests.push({body:init.body,idempotency:new Headers(init.headers).get('idempotency-key')})
  return success?accepted():Response.json({error:{type:'api_error',message:'Temporarily unavailable'}},{status:500,headers:{'stripe-should-retry':'false','request-id':'req_retryfixture'}})
 }))
 await expect(createCheckout(generated.previewToken)).rejects.toMatchObject({status:502})
 expect((await sql()`select status from website_orders`)[0]!.status).toBe('CREATING')
 await updateSettings({commerce:{priceCents:29900}})
 success=true
 await createCheckout(generated.previewToken)
 expect(requests.at(-1)).toEqual(requests[0])
 expect((await sql()`select amount_cents,status from website_orders`)[0]).toMatchObject({amount_cents:19900,status:'OPEN'})
})

it('never exposes credentials, request headers, email addresses or private URLs in stored/logged diagnostics',async()=>{
 const generated=await site()
 offlineStripe(()=>Response.json({error:{type:'authentication_error',message:'Invalid API Key provided: sk_test_do_not_reveal whsec_do_not_reveal pi_id_secret_do_not_reveal buyer@example.test https://localhost/purchase/private-token',headers:{authorization:'Bearer do_not_reveal'}}},{status:401,headers:{'request-id':'req_redactedfixture'}}))
 await expect(createCheckout(generated.previewToken)).rejects.toMatchObject({code:'STRIPE_AUTHENTICATION'})
 const serialized=JSON.stringify({diagnostics:await checkoutDiagnostics(),logs:capture.mock.calls})
 expect(serialized).not.toMatch(/do_not_reveal|buyer@example|private-token|authorization|sk_test_/)
 expect(serialized).toContain('masqué')
})

it('classifies permission, tax, network and account problems without treating network failures as definitive',()=>{
 expect(checkoutFailure(new Stripe.errors.StripePermissionError({message:'No access'}))).toMatchObject({category:'permissions',definitive:true})
 expect(checkoutFailure(new Stripe.errors.StripeInvalidRequestError({message:'No such tax rate',param:'line_items[0][tax_rates][0]'}))).toMatchObject({category:'tax_rate',definitive:true})
 expect(checkoutFailure(new Stripe.errors.StripeConnectionError({message:'Connection failed'}))).toMatchObject({category:'connection',definitive:false})
 expect(checkoutFailure(new Stripe.errors.StripeInvalidRequestError({message:'Your account must be activated to accept payments'}))).toMatchObject({category:'account'})
 expect(checkoutFailure(new Error('unknown secret text'))).toMatchObject({detail:null,definitive:false})
 expect(redactStripeDetail('Bearer private-token\nwhsec_abc')).not.toMatch(/private-token|whsec_abc|\n/)
})

it('explains the network cause hidden behind a Stripe connection error',()=>{
 const tls=Object.assign(new Error('unable to get local issuer certificate'),{code:'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'})
 const failure=checkoutFailure(new Stripe.errors.StripeConnectionError({message:'An error occurred with our connection to Stripe. Request was retried 2 times.',detail:new TypeError('fetch failed',{cause:tls})}))
 expect(failure).toMatchObject({category:'connection',definitive:false,message:expect.stringContaining('certificat')})
 expect(failure.detail).toContain('UNABLE_TO_GET_ISSUER_CERT_LOCALLY')
 const blocked=Object.assign(new AggregateError([Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'),{code:'ECONNREFUSED'})],''),{code:'ECONNREFUSED'})
 expect(checkoutFailure(new Stripe.errors.StripeConnectionError({message:'Connection failed',detail:new TypeError('fetch failed',{cause:blocked})}))).toMatchObject({message:expect.stringContaining('bloquée'),action:expect.stringContaining('pare-feu')})
 expect(checkoutFailure(new Stripe.errors.StripeConnectionError({message:'Connection failed'}))).toMatchObject({message:'La connexion à Stripe a échoué.'})
})

it('disables Managed Payments and explains its tax-code refusal',async()=>{
 const generated=await site()
 const fetcher=offlineStripe(form=>{expect(form.get('managed_payments[enabled]')).toBe('false');return accepted()})
 await createCheckout(generated.previewToken)
 expect(fetcher).toHaveBeenCalledTimes(1)
 expect(checkoutFailure(new Stripe.errors.StripeInvalidRequestError({message:'Invalid line_items[0]: the product tax code is missing. Product tax code is required for Managed Payments, which is enabled by default on your account.'}))).toMatchObject({category:'managed_payments',definitive:true})
})

it('restarts an order frozen with parameters from before Managed Payments was disabled',async()=>{
 const generated=await site()
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('fetch failed')}))
 await expect(createCheckout(generated.previewToken)).rejects.toMatchObject({status:502})
 await sql()`update website_orders set checkout_params=checkout_params-'managed_payments'`
 const fetcher=offlineStripe(form=>{expect(form.get('managed_payments[enabled]')).toBe('false');return accepted()})
 expect(await createCheckout(generated.previewToken)).toContain('checkout.stripe.com')
 const [failed]=await sql()<{id:string}[]>`select id from website_orders where status='FAILED'`
 expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get('idempotency-key')).not.toBe(`website-order:${failed!.id}`)
 expect(await sql()`select status from website_orders order by created_at`).toMatchObject([{status:'FAILED'},{status:'OPEN'}])
})

it('refuses a tax rate that Stripe would add on top of the price before opening Checkout',async()=>{
 const generated=await site()
 await updateSettings({commerce:{taxRateId:'txr_exclusive'}})
 const calls:string[]=[]
 vi.stubGlobal('fetch',vi.fn(async(input:unknown)=>{
  calls.push(new URL(String(input)).pathname)
  return Response.json({id:'txr_exclusive',object:'tax_rate',active:true,inclusive:false,percentage:20})
 }))
 await expect(createCheckout(generated.previewToken)).rejects.toMatchObject({status:502,code:'STRIPE_TAX_RATE'})
 expect(calls).toEqual(['/v1/tax_rates/txr_exclusive'])
 expect((await checkoutDiagnostics()).test).toMatchObject({category:'tax_rate',message:expect.stringContaining('inclus')})
 expect((await sql()`select status from website_orders`)[0]!.status).toBe('FAILED')
})

it('confirms a paid order from Stripe when the webhook was missed',async()=>{
 const generated=await site()
 offlineStripe(()=>accepted())
 await createCheckout(generated.previewToken)
 const [order]=await sql()<{id:string;access_token:string}[]>`select id,access_token from website_orders`
 vi.stubGlobal('fetch',vi.fn(async(input:unknown)=>{
  const path=new URL(String(input)).pathname
  if(path==='/v1/checkout/sessions/cs_fixture_checkout')return Response.json({id:'cs_fixture_checkout',object:'checkout.session',status:'complete',payment_status:'paid',livemode:false,currency:'eur',amount_total:19900,metadata:{order_id:order!.id},customer:'cus_fixture',customer_details:{email:'acheteur@example.test'},invoice:'in_fixture'})
  if(path==='/v1/invoices/in_fixture')return Response.json({id:'in_fixture',object:'invoice',status:'paid',livemode:false,currency:'eur',total:19900,metadata:{order_id:order!.id},hosted_invoice_url:'https://invoice.stripe.com/i/fixture',invoice_pdf:'https://pay.stripe.com/invoice/fixture/pdf'})
  throw new Error('unexpected '+path)
 }))
 await syncOrderFromStripe(order!.access_token)
 expect((await sql()`select status,buyer_email,invoice_url from website_orders`)[0]).toMatchObject({status:'PAID',buyer_email:'acheteur@example.test',invoice_url:'https://invoice.stripe.com/i/fixture'})
 expect(await sql()`select id from automation_jobs where type='customer.access_email'`).toHaveLength(1)
 await syncOrderFromStripe(order!.access_token) // already complete: no further Stripe call needed
})
