import {afterAll,beforeEach,expect,it} from 'vitest'
import type Stripe from 'stripe'
import {resetDb,insertTestBusiness} from './helpers'
import {closeDb,sql} from '@/server/core/db'
import {updateSettings} from '@/server/core/settings'
import {generateWebsite} from '@/server/sites/service'
import {randomToken} from '@/server/core/crypto'
import {processStripeEvent} from '@/server/billing/orders'
import {deliverCustomerAccess,requestCustomerAccess} from '@/server/billing/customer-access'

beforeEach(async()=>{await resetDb();await updateSettings({sites:{previewBaseUrl:'http://localhost:3999'}})})
afterAll(closeDb)

async function order(status:string,email:string|null){
 const business=await insertTestBusiness(),site=await generateWebsite(business,{generator:'deterministic'}),token=randomToken(32)
 const [row]=await sql()<{id:string}[]>`insert into website_orders(website_id,business_id,business_name,version,snapshot,amount_cents,currency,livemode,access_token,status,buyer_email,paid_at)
  values(${site.websiteId},${business},'TEST Salon Démo',1,'{}'::jsonb,19900,'eur',false,${token},${status},${email},case when ${status}='PAID' then now() end) returning id`
 return {id:row!.id,token}
}

it('gives the same answer for unknown addresses and shows test links only in test mode',async()=>{
 const paid=await order('PAID','Client@Example.test')
 await order('OPEN','client@example.test')
 expect(await requestCustomerAccess('inconnu@example.test','1.1.1.1')).toEqual({sent:true,testLinks:[]})
 const known=await requestCustomerAccess(' CLIENT@example.test ','1.1.1.1')
 expect(known.sent).toBe(true)
 expect(known.testLinks).toEqual([{businessName:'TEST Salon Démo',url:`http://localhost:3999/purchase/${paid.token}`}])
 await expect(requestCustomerAccess('pas-un-email','1.1.1.1')).rejects.toMatchObject({status:400})
 // Test mode uses the sandbox provider: the job sends nothing.
 expect(await deliverCustomerAccess({email:'client@example.test',reason:'request',key:'k'})).toMatchObject({sent:0})
})

it('throttles per IP and silently per address',async()=>{
 await order('PAID','client@example.test')
 for(let i=0;i<3;i++)expect((await requestCustomerAccess('client@example.test','2.2.2.2')).testLinks).toHaveLength(1)
 expect((await requestCustomerAccess('client@example.test','2.2.2.2')).testLinks).toHaveLength(0)
 for(let i=0;i<6;i++)await requestCustomerAccess(`autre${i}@example.test`,'2.2.2.2')
 await expect(requestCustomerAccess('encore@example.test','2.2.2.2')).rejects.toMatchObject({status:429})
})

it('queues the access email once the payment is confirmed',async()=>{
 const pending=await order('CREATING',null)
 await sql()`update website_orders set stripe_session_id='cs_test_access' where id=${pending.id}`
 const event={id:'evt_access',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_access',metadata:{order_id:pending.id},currency:'eur',amount_total:19900,payment_status:'paid',customer_details:{email:'acheteur@example.test'}}}} as unknown as Stripe.Event
 expect(await processStripeEvent(event)).toMatchObject({status:'PAID'})
 const jobs=await sql()<{payload:{email:string;reason:string}}[]>`select payload from automation_jobs where type='customer.access_email'`
 expect(jobs.map(j=>j.payload)).toMatchObject([{email:'acheteur@example.test',reason:'paid'}])
})
