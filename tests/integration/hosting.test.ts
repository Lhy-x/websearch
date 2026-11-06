import {afterAll,beforeEach,expect,it,vi} from 'vitest'
import {randomBytes} from 'node:crypto'
import {resetDb,insertTestBusiness} from './helpers'
import {sql,closeDb} from '@/server/core/db'
import {getSecret,updateSettings,setSecret} from '@/server/core/settings'
import {generateWebsite} from '@/server/sites/service'
import {createHostingCheckout,processHostingStripeEvent,customerDashboard,reconcileHosting,saveCustomerDomain,checkHostingDomain,requestPublication} from '@/server/hosting/service'
import {setLaunchMode} from '@/server/core/launch'
const mocks=vi.hoisted(()=>({create:vi.fn(),retrieve:vi.fn(),subscription:vi.fn(),publish:vi.fn(),suspend:vi.fn(),dns:vi.fn(),map:vi.fn(),https:vi.fn(),balance:vi.fn()}))
vi.mock('@/server/billing/stripe',async original=>({...await original<typeof import('@/server/billing/stripe')>(),stripeClient:async()=>({checkout:{sessions:{create:mocks.create,retrieve:mocks.retrieve}},subscriptions:{retrieve:mocks.subscription},balance:{retrieve:mocks.balance}})}))
vi.mock('@/server/hosting/o2switch',async original=>({...await original<typeof import('@/server/hosting/o2switch')>(),publishO2Site:mocks.publish,suspendO2Site:mocks.suspend,domainDnsStatus:mocks.dns,mapO2Domain:mocks.map,domainHttpsReady:mocks.https}))
beforeEach(async()=>{
 await resetDb();vi.resetAllMocks()
 await updateSettings({hosting:{enabled:true,monthlyPriceCents:2900,serverIp:'82.165.1.1'},commerce:{enabled:true,priceCents:19900}})
 mocks.create.mockResolvedValue({id:'cs_host_fixture',url:'https://checkout.stripe.com/c/fixture'})
 mocks.retrieve.mockResolvedValue({status:'open',url:'https://checkout.stripe.com/c/fixture'})
 mocks.publish.mockResolvedValue({url:'https://atelier.example.test/pf-sites/fixture/',release:'fixture',warnings:[]})
 mocks.dns.mockResolvedValue({owned:true,pointsHere:true});mocks.https.mockResolvedValue(true)
})
afterAll(closeDb)
async function order(live=false){
 const businessId=await insertTestBusiness(),site=await generateWebsite(businessId,{generator:'deterministic'})
 const [version]=await sql()`select config from website_versions where website_id=${site.websiteId} order by version desc limit 1`
 const token=randomBytes(32).toString('base64url')
 const [row]=await sql()< {id:string}[]>`insert into website_orders(website_id,business_id,business_name,version,snapshot,amount_cents,currency,livemode,status,access_token) values(${site.websiteId},${businessId},'TEST Hosting',1,${sql().json(version!.config)},19900,'eur',${live},'PAID',${token}) returning id`
 return {id:row!.id,token,live}
}
async function subscription(o:Awaited<ReturnType<typeof order>>,status='active'){
 const [row]=await sql()`select * from website_hosting where order_id=${o.id}`
 return {id:'sub_fixture',customer:'cus_fixture',status,cancel_at_period_end:false,metadata:{hosting_order_id:o.id,hosting_attempt:row!.checkout_attempt},latest_invoice:{status:'paid'},items:{data:[{quantity:1,current_period_end:Math.floor(Date.now()/1000)+86400,price:{unit_amount:row!.monthly_price_cents,currency:row!.currency,recurring:{interval:'month',interval_count:1}}}]}}
}
async function paid(o:Awaited<ReturnType<typeof order>>){
 await createHostingCheckout(o.token)
 const sub=await subscription(o);mocks.subscription.mockResolvedValue(sub)
 const signal={id:'evt_host_fixture',type:'customer.subscription.updated' as const,livemode:o.live,data:{object:{id:sub.id,metadata:sub.metadata}}}
 await processHostingStripeEvent(signal)
 return {sub,signal}
}

it('preserves a frozen, idempotent checkout across a timeout and a seller price change; grants nothing beforehand',async()=>{
 const o=await order();mocks.create.mockRejectedValueOnce(new Error('timeout'))
 await expect(createHostingCheckout(o.token)).rejects.toMatchObject({status:502})
 await updateSettings({hosting:{monthlyPriceCents:4900}})
 await createHostingCheckout(o.token)
 const calls=mocks.create.mock.calls
 expect(calls[0]![0]).toEqual(calls[1]![0]);expect(calls[0]![1]).toEqual(calls[1]![1])
 expect(calls[1]![0].line_items[0].price_data.unit_amount).toBe(2900)
 expect(calls[1]![0].managed_payments).toEqual({enabled:false})
 expect((await customerDashboard(o.token)).hosting.active).toBe(false)
 await expect(requestPublication(o.token)).rejects.toThrow('abonnement confirmé')
 await createHostingCheckout(o.token);expect(mocks.create).toHaveBeenCalledTimes(2)
})
it('uses canonical paid subscription state, ignores duplicate webhooks and simulates publication without any hosting call',async()=>{
 const o=await order(),{signal}=await paid(o)
 expect(await processHostingStripeEvent(signal)).toMatchObject({duplicate:true})
 expect((await customerDashboard(o.token)).hosting.active).toBe(true)
 await updateSettings({launch:{mode:'live'}},{allowModeChange:true})
 await reconcileHosting(o.id)
 expect((await customerDashboard(o.token)).hosting).toMatchObject({status:'READY',url:`/purchase/${o.token}/site`})
 await saveCustomerDomain(o.token,'www.client.fr');await checkHostingDomain(o.id,'www.client.fr')
 expect((await customerDashboard(o.token)).hosting.domainStatus).toBe('SIMULATED')
 expect(mocks.publish).not.toHaveBeenCalled();expect(mocks.map).not.toHaveBeenCalled();expect(mocks.dns).not.toHaveBeenCalled()
 await expect(createHostingCheckout(o.token)).rejects.toThrow('autre mode')
 expect(JSON.stringify(await customerDashboard(o.token))).not.toMatch(/checkout_attempt|stripe_customer_id|snapshot|sk_test_|whsec_/)
})
it('refuses an active but unpaid or altered subscription and ignores a stale attempt',async()=>{
 const o=await order();await createHostingCheckout(o.token)
 const sub=await subscription(o);sub.latest_invoice.status='open';mocks.subscription.mockResolvedValue(sub)
 const signal={id:'evt_unpaid',type:'customer.subscription.updated' as const,livemode:false,data:{object:{id:sub.id,metadata:sub.metadata}}}
 await processHostingStripeEvent(signal);expect((await customerDashboard(o.token)).hosting.active).toBe(false)
 sub.latest_invoice.status='paid';sub.items.data[0]!.price.unit_amount=1
 await processHostingStripeEvent({...signal,id:'evt_wrong_price'});expect((await customerDashboard(o.token)).hosting.subscriptionStatus).toBe('invalid_plan')
 expect(await processHostingStripeEvent({...signal,id:'evt_stale',data:{object:{id:sub.id,metadata:{...sub.metadata,hosting_attempt:'old-attempt'}}}})).toMatchObject({stale:true})
})
it('suspends a real deployment on past-due payment and never suspends another order folder',async()=>{
 await updateSettings({launch:{mode:'live'},runtime:{APP_BASE_URL:'https://atelier.example.test'}},{allowModeChange:true})
 const o=await order(true),{sub,signal}=await paid(o)
 await reconcileHosting(o.id);expect(mocks.publish).toHaveBeenCalledTimes(1)
 await reconcileHosting(o.id);expect(mocks.publish).toHaveBeenCalledTimes(1)
 mocks.subscription.mockResolvedValue({...sub,status:'past_due'})
 await processHostingStripeEvent({...signal,id:'evt_past_due'})
 await reconcileHosting(o.id)
 expect(mocks.suspend).toHaveBeenCalledExactlyOnceWith(o.id)
 expect((await customerDashboard(o.token)).hosting.status).toBe('SUSPENDED')
})
it('requires both TXT ownership and the correct A record before mapping a real domain, then waits for valid HTTPS',async()=>{
 await updateSettings({launch:{mode:'live'},runtime:{APP_BASE_URL:'https://atelier.example.test'}},{allowModeChange:true})
 const o=await order(true);await paid(o);await reconcileHosting(o.id)
 await saveCustomerDomain(o.token,'www.client.fr')
 mocks.dns.mockResolvedValue({owned:false,pointsHere:true})
 await checkHostingDomain(o.id,'www.client.fr');expect(mocks.map).not.toHaveBeenCalled()
 mocks.dns.mockResolvedValue({owned:true,pointsHere:true});mocks.https.mockResolvedValue(false)
 await checkHostingDomain(o.id,'www.client.fr')
 expect((await customerDashboard(o.token)).hosting.domainStatus).toBe('PENDING_TLS')
 await saveCustomerDomain(o.token,'www.client.fr') // An unchanged value must preserve mapping.
 await expect(saveCustomerDomain(o.token,'other.client.fr')).rejects.toThrow('déjà relié')
 mocks.https.mockResolvedValue(true);await checkHostingDomain(o.id,'www.client.fr')
 expect(mocks.map).toHaveBeenCalledTimes(1)
 expect((await customerDashboard(o.token)).hosting.url).toBe('https://www.client.fr/')
 await sql()`update website_hosting set deploy_status='SUSPENDED' where order_id=${o.id}`
 await reconcileHosting(o.id)
 expect((await customerDashboard(o.token)).hosting.url).toBe('https://www.client.fr/')
})

it('serializes publication and suspension for the same order and rechecks payment after the upload',async()=>{
 await updateSettings({launch:{mode:'live'},runtime:{APP_BASE_URL:'https://atelier.example.test'}},{allowModeChange:true})
 const o=await order(true);await paid(o)
 let finish!:(value:{url:string;release:string;warnings:string[]})=>void
 mocks.publish.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const publication=reconcileHosting(o.id)
 await expect.poll(()=>!!finish).toBe(true)
 await expect(reconcileHosting(o.id)).rejects.toThrow('déjà en cours')
 await sql()`update website_hosting set subscription_status='canceled' where order_id=${o.id}`
 finish({url:'https://clients.example.fr/site/',release:'fixture',warnings:[]})
 expect(await publication).toMatchObject({suspended:true})
 expect(mocks.suspend).toHaveBeenCalledExactlyOnceWith(o.id)
 expect((await customerDashboard(o.token)).hosting.status).toBe('SUSPENDED')
})
it('keeps test mode by default and prevents bypassing readiness through generic settings',async()=>{
 await expect(updateSettings({launch:{mode:'live'}})).rejects.toThrow()
 await expect(setLaunchMode('live')).rejects.toThrow('Configuration incomplète')
 expect(mocks.balance).not.toHaveBeenCalled()
 await setSecret('STRIPE_SECRET_KEY','sk_live_fixture_only');await setSecret('STRIPE_WEBHOOK_SECRET','whsec_live_fixture')
 await setSecret('STRIPE_TEST_SECRET_KEY','sk_test_fixture_only');await setSecret('STRIPE_TEST_WEBHOOK_SECRET','whsec_test_fixture')
 await updateSettings({hosting:{enabled:false},runtime:{APP_BASE_URL:'https://atelier.example.test'}})
 mocks.balance.mockResolvedValue({object:'balance'})
 await setLaunchMode('live');expect(mocks.balance).toHaveBeenCalledTimes(1)
 await setLaunchMode('test')
 expect(await getSecret('STRIPE_SECRET_KEY')).toBe('sk_live_fixture_only')
 expect(await getSecret('STRIPE_TEST_SECRET_KEY')).toBe('sk_test_fixture_only')
 expect(mocks.create).not.toHaveBeenCalled();expect(mocks.publish).not.toHaveBeenCalled()
})
