import Stripe from 'stripe'
import { randomUUID } from 'node:crypto'
import { sql } from '../core/db'
import { AppError } from '../core/errors'
import { randomToken } from '../core/crypto'
import { getSettings,getRuntimeConfig } from '../core/settings'
import { publicBase,stripeClient,stripeUrl } from '../billing/stripe'
import { websiteVersionSchema } from '@/lib/site/bespoke-schema'
import { enqueueJob } from '../jobs/queue'
import { publishO2Site,suspendO2Site,normalizeCustomerDomain,domainDnsStatus,mapO2Domain,domainHttpsReady } from './o2switch'

type HostingRow={order_id:string;checkout_attempt:string;checkout_session_id:string|null;checkout_url:string|null;checkout_params:Stripe.Checkout.SessionCreateParams|null;stripe_customer_id:string|null;stripe_subscription_id:string|null;subscription_status:string;current_period_end:Date|null;cancel_at_period_end:boolean;monthly_price_cents:number|null;currency:string|null;publish_requested:boolean;provider_site_id:string|null;provider_site_url:string|null;deploy_id:string|null;deploy_status:string;deploy_url:string|null;domain:string|null;domain_challenge:string|null;domain_requested_at:Date|null;domain_status:string;last_error:string|null;subscription_checked_at:Date|null}
type PaidOrder={id:string;access_token:string;business_name:string;amount_cents:number;currency:string;livemode:boolean;snapshot:unknown;stripe_customer_id:string|null;buyer_email:string|null;invoice_url:string|null;invoice_pdf:string|null}
export function hostingAccess(row:Pick<HostingRow,'subscription_status'|'current_period_end'>|null|undefined){return row?.subscription_status==='active'&&!!row.current_period_end&&new Date(row.current_period_end).getTime()>Date.now()}
async function paidOrder(token:string):Promise<PaidOrder>{if(!/^[a-zA-Z0-9_-]{35,64}$/.test(token))throw new AppError('Espace client introuvable',404);const [order]=await sql()<PaidOrder[]>`select * from website_orders where access_token=${token} and status='PAID'`;if(!order)throw new AppError('Cet espace est accessible après confirmation du paiement du site.',409);return order}
async function ensureHosting(orderId:string){await sql()`insert into website_hosting(order_id) values(${orderId}) on conflict do nothing`}
async function hostingRow(orderId:string){const [row]=await sql()<HostingRow[]>`select * from website_hosting where order_id=${orderId}`;return row??null}
async function customerBase(live:boolean){return publicBase(live,(await getRuntimeConfig()).APP_BASE_URL)}

// A dedicated session lock spans remote uploads without keeping a SQL transaction open.
// Other jobs retry instead of publishing and suspending the same folder concurrently.
async function withHostingLock<T>(orderId:string,work:()=>Promise<T>):Promise<T>{
 const connection=await sql().reserve()
 let locked=false
 try{
  const [result]=await connection`select pg_try_advisory_lock(hashtextextended(${orderId},92)) locked`
  locked=!!result?.locked
  if(!locked)throw new AppError('Une opération est déjà en cours sur ce site. Réessayez dans quelques instants.',409)
  return await work()
 }finally{try{if(locked)await connection`select pg_advisory_unlock(hashtextextended(${orderId},92))`}finally{connection.release()}}
}

export async function customerDashboard(token:string){
 const order=await paidOrder(token),settings=await getSettings(),row=await hostingRow(order.id),active=hostingAccess(row)
 const contracted=!!row&&(!!row.stripe_subscription_id&&row.subscription_status!=='canceled'||!!row.checkout_params&&row.subscription_status==='checkout_pending')
 return {businessName:order.business_name,test:!order.livemode,mode:settings.launch.mode,invoiceUrl:order.invoice_url,invoicePdf:order.invoice_pdf,offer:{enabled:settings.hosting.enabled,priceCents:contracted?row!.monthly_price_cents:settings.hosting.monthlyPriceCents,currency:contracted?row!.currency:settings.hosting.currency,title:settings.hosting.title},hosting:{active,subscriptionStatus:row?.subscription_status??'none',currentPeriodEnd:row?.current_period_end?.toISOString()??null,cancelAtPeriodEnd:row?.cancel_at_period_end??false,hasCustomer:!!row?.stripe_customer_id,status:row?.deploy_status??'DRAFT',url:row?.deploy_url??null,error:row?.last_error??null,domain:row?.domain??null,domainStatus:row?.domain_status??'NONE',dns:row?.domain?{txtName:`_prospectforge.${row.domain}`,txtValue:row.domain_challenge,ip:settings.hosting.serverIp||null}:null}}
}

export async function createHostingCheckout(token:string){
 const order=await paidOrder(token),settings=await getSettings()
 if(order.livemode!==(settings.launch.mode==='live'))throw new AppError('Cette commande appartient à un autre mode. Une commande de test ne peut pas être transformée en abonnement réel.',409)
 if(!settings.hosting.enabled||!settings.hosting.monthlyPriceCents)throw new AppError('Le vendeur n’a pas encore activé son offre d’hébergement.',409)
 await ensureHosting(order.id)
 const stripe=await stripeClient(order.livemode),base=await customerBase(order.livemode)
 const intent=await sql().begin(async tx=>{
  const [row]=await tx<HostingRow[]>`select * from website_hosting where order_id=${order.id} for update`
  const resubscribe=!!row!.stripe_subscription_id&&['canceled','incomplete_expired'].includes(row!.subscription_status)
  if(row!.stripe_subscription_id&&!resubscribe)throw new AppError('Un abonnement existe déjà. Utilisez Gérer mon abonnement.',409)
  if(row!.checkout_session_id&&!resubscribe){const session=await stripe.checkout.sessions.retrieve(row!.checkout_session_id);if(session.status==='open'&&stripeUrl(session.url))return {url:stripeUrl(session.url)!};if(session.status==='complete')throw new AppError('Abonnement en cours de confirmation. Patientez quelques instants.',409)}
  const fresh=!!row!.checkout_session_id||resubscribe
  const attempt=fresh?randomUUID():row!.checkout_attempt
  const metadata={hosting_order_id:order.id,hosting_attempt:attempt}
  const customer=row!.stripe_customer_id||order.stripe_customer_id
  const proposed:Stripe.Checkout.SessionCreateParams={mode:'subscription',client_reference_id:order.id,metadata,subscription_data:{metadata},billing_address_collection:'required',tax_id_collection:{enabled:true},...(customer?{customer}:order.buyer_email?{customer_email:order.buyer_email}:{}),line_items:[{quantity:1,...(settings.commerce.taxRateId?{tax_rates:[settings.commerce.taxRateId]}:{}),price_data:{tax_behavior:'inclusive',currency:settings.hosting.currency,unit_amount:settings.hosting.monthlyPriceCents!,recurring:{interval:'month'},product_data:{name:settings.hosting.title,description:order.business_name}}}],success_url:`${base}/purchase/${token}?hosting=return`,cancel_url:`${base}/purchase/${token}#hosting`}
  const params=row!.checkout_params&&!fresh?row!.checkout_params:proposed
  const price=params.line_items![0]!.price_data!
  await tx`update website_hosting set checkout_attempt=${attempt},checkout_session_id=null,checkout_url=null,checkout_params=${tx.json(params as never)},monthly_price_cents=${Number(price.unit_amount)},currency=${String(price.currency)},publish_requested=true,stripe_subscription_id=null,subscription_status='checkout_pending' where order_id=${order.id}`
  return {params,attempt}
 })
 if('url' in intent)return {url:intent.url}
 const session=await stripe.checkout.sessions.create(intent.params,{idempotencyKey:`hosting-checkout:${order.id}:${intent.attempt}`})
 const url=stripeUrl(session.url);if(!url)throw new AppError('Stripe n’a pas renvoyé de lien d’abonnement.',502)
 await sql()`update website_hosting set checkout_session_id=${session.id},checkout_url=${url} where order_id=${order.id} and checkout_attempt=${intent.attempt}`
 return {url}
}

export async function hostingPortal(token:string){const order=await paidOrder(token),row=await hostingRow(order.id);if(!row?.stripe_customer_id)throw new AppError('Aucun abonnement à gérer pour cette commande.',409);const session=await (await stripeClient(order.livemode)).billingPortal.sessions.create({customer:row.stripe_customer_id,return_url:`${await customerBase(order.livemode)}/purchase/${token}`});const url=stripeUrl(session.url);if(!url)throw new AppError('Portail Stripe indisponible. Contactez le vendeur.',502);return {url}}

const ref=(value:unknown)=>typeof value==='string'?value:value&&typeof value==='object'&&'id' in value?String(value.id):null
type HostingStripeSignal=Pick<Stripe.Event,'id'|'type'|'livemode'>&{data:{object:unknown}}
export async function processHostingStripeEvent(event:HostingStripeSignal):Promise<Record<string,unknown>|null>{
 const object=event.data.object as unknown as Record<string,unknown>,metadata=object.metadata as Record<string,string>|undefined
 let subId:string|null=null,orderId=metadata?.hosting_order_id
 if(event.type.startsWith('customer.subscription.'))subId=ref(object)
 else if(event.type.startsWith('checkout.session.'))subId=ref(object.subscription)
 else if(event.type.startsWith('invoice.')){const parent=object.parent as {subscription_details?:{subscription?:unknown}}|undefined;subId=ref(object.subscription)??ref(parent?.subscription_details?.subscription)}
 if(!orderId&&subId){const [row]=await sql()`select order_id from website_hosting where stripe_subscription_id=${subId}`;orderId=row?.order_id}
 if(!orderId)return null
 if(!/^[0-9a-f-]{36}$/i.test(orderId))return {ignored:true}
 const supported=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','invoice.payment_succeeded']
 if(!supported.includes(event.type))return {ignored:true}
 const [order]=await sql()<PaidOrder[]>`select * from website_orders where id=${orderId} and status='PAID'`
 if(!order)return {ignored:true}
 if(order.livemode!==event.livemode)throw new AppError('Mode de l’abonnement incohérent',400)
 const before=await hostingRow(order.id);if(!before)return {ignored:true}
 if(metadata?.hosting_attempt&&metadata.hosting_attempt!==before.checkout_attempt)return {stale:true}
 if(event.type.startsWith('checkout.session.')&&before.checkout_session_id&&before.checkout_session_id!==object.id)return {stale:true}
 if(before.stripe_subscription_id&&subId&&before.stripe_subscription_id!==subId)return {stale:true}
 if(!subId){if(event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed')await sql()`update website_hosting set checkout_session_id=null,checkout_url=null,checkout_params=null,checkout_attempt=gen_random_uuid(),subscription_status='none' where order_id=${order.id} and stripe_subscription_id is null`;return {pending:true}}
 const checkedAt=new Date()
 const subscription=await (await stripeClient(order.livemode)).subscriptions.retrieve(subId,{expand:['latest_invoice']})
 if(subscription.metadata.hosting_order_id!==order.id||subscription.metadata.hosting_attempt!==before.checkout_attempt)return {stale:true}
 const item=subscription.items.data[0],price=item?.price,invoice=typeof subscription.latest_invoice==='object'?subscription.latest_invoice:null
 const matches=subscription.items.data.length===1&&item?.quantity===1&&price?.unit_amount===before.monthly_price_cents&&price.currency===before.currency&&price.recurring?.interval==='month'&&price.recurring.interval_count===1
 const status=!matches?'invalid_plan':subscription.status==='active'&&invoice?.status!=='paid'?'payment_pending':subscription.status
 return sql().begin(async tx=>{
  const [row]=await tx<HostingRow[]>`select * from website_hosting where order_id=${order.id} for update`
  if(row!.checkout_attempt!==before.checkout_attempt||row!.subscription_checked_at&&new Date(row!.subscription_checked_at)>checkedAt)return {stale:true}
  const [seen]=await tx`insert into stripe_events(id,type) values(${event.id},${event.type}) on conflict do nothing returning id`;if(!seen)return {duplicate:true}
  await tx`update website_hosting set stripe_subscription_id=${subscription.id},stripe_customer_id=${ref(subscription.customer)},subscription_status=${status},subscription_checked_at=${checkedAt},current_period_end=${item?.current_period_end?new Date(item.current_period_end*1000):null},cancel_at_period_end=${subscription.cancel_at_period_end} where order_id=${order.id}`
  await tx`insert into automation_jobs(type,payload,priority,max_attempts,idempotency_key) values('hosting.reconcile',${tx.json({orderId:order.id})},15,3,${'hosting-event:'+event.id}) on conflict do nothing`
  return {hosting:true,status}
 })
}

export async function requestPublication(token:string){const order=await paidOrder(token),row=await hostingRow(order.id);if(!hostingAccess(row))throw new AppError('Un abonnement confirmé et à jour est nécessaire pour publier.',409);await sql()`update website_hosting set publish_requested=true,deploy_status=case when deploy_status='READY' then deploy_status else 'QUEUED' end where order_id=${order.id}`;return {jobId:(await enqueueJob('hosting.reconcile',{orderId:order.id},{priority:20,idempotencyKey:`hosting-publish:${order.id}:${Math.floor(Date.now()/30000)}`})).job.id}}

export async function reconcileHosting(orderId:string,log:(message:string,progress?:number)=>Promise<void>|void=()=>{}){
 return withHostingLock(orderId,()=>reconcileHostingLocked(orderId,log))
}
async function reconcileHostingLocked(orderId:string,log:(message:string,progress?:number)=>Promise<void>|void){
 const [order]=await sql()<PaidOrder[]>`select * from website_orders where id=${orderId} and status='PAID'`;if(!order)return {ignored:true}
 const row=await hostingRow(order.id);if(!row)return {ignored:true}
 if(!hostingAccess(row)){
  if(order.livemode&&row.deploy_status==='READY'&&row.provider_site_id)await suspendO2Site(order.id)
  await sql()`update website_hosting set deploy_status=case when provider_site_id is null then 'DRAFT' else 'SUSPENDED' end where order_id=${order.id}`
  return {suspended:true}
 }
 if(!row.publish_requested)return {waiting:true}
 if(row.deploy_status==='READY')return {alreadyPublished:true}
 await sql()`update website_hosting set deploy_status='DEPLOYING',last_error=null where order_id=${order.id}`
 await log(order.livemode?'Transfert sécurisé vers o2switch…':'Simulation de publication : aucun transfert o2switch.',.2)
 try{
  const published=order.livemode?await publishO2Site(order.id,websiteVersionSchema.parse(order.snapshot)):{url:`/purchase/${order.access_token}/site`,release:'test-'+randomUUID(),warnings:[]}
  // Recheck the contract after the upload so an intervening cancellation cannot activate the site.
  if(!hostingAccess(await hostingRow(order.id))){if(order.livemode)await suspendO2Site(order.id);await sql()`update website_hosting set deploy_status='SUSPENDED' where order_id=${order.id}`;return {suspended:true}}
  await sql()`update website_hosting set provider_type=${order.livemode?'o2switch':'simulation'},provider_site_id=${order.id},provider_site_url=${published.url},deploy_id=${published.release},deploy_status='READY',deploy_url=case when domain_status='ACTIVE' and domain is not null then 'https://' || domain || '/' else ${published.url} end,last_error=null where order_id=${order.id}`
  await log(order.livemode?'Site publié chez o2switch.':'Aperçu de publication prêt en mode test.',1)
  return {published:true,test:!order.livemode,warnings:published.warnings}
 }catch{await sql()`update website_hosting set deploy_status='ERROR',last_error='La publication n’a pas abouti. Réessayez ou contactez le vendeur ; vos fichiers restent téléchargeables.' where order_id=${order.id}`;throw new AppError('Publication o2switch interrompue. Le client peut réessayer depuis son espace.',502)}
}

export async function saveCustomerDomain(token:string,value:string){
 const order=await paidOrder(token)
 return withHostingLock(order.id,()=>saveCustomerDomainLocked(token,value))
}
async function saveCustomerDomainLocked(token:string,value:string){
 const order=await paidOrder(token),row=await hostingRow(order.id);if(!hostingAccess(row))throw new AppError('Activez d’abord votre abonnement pour connecter un domaine.',409)
 const domain=normalizeCustomerDomain(value)
 if(row!.domain&&row!.domain!==domain&&['ACTIVE','MAPPED','PENDING_TLS'].includes(row!.domain_status))throw new AppError('Ce domaine est déjà relié. Contactez le vendeur pour changer d’adresse sans interrompre votre site.',409)
 const challenge=row!.domain===domain&&row!.domain_challenge?row!.domain_challenge:randomToken(24)
 try{await sql()`update website_hosting set domain=${domain},domain_challenge=${challenge},domain_requested_at=case when domain=${domain} then domain_requested_at else now() end,domain_status=case when domain=${domain} then domain_status else ${order.livemode?'PENDING_DNS':'SIMULATED'} end,last_error=null where order_id=${order.id}`}catch(error){if((error as {code?:string}).code==='23505')throw new AppError('Ce domaine est déjà utilisé pour un autre site.',409);throw error}
 await enqueueJob('hosting.domain_check',{orderId:order.id,domain},{priority:30,idempotencyKey:`hosting-domain:${order.id}:${domain}:${Math.floor(Date.now()/60000)}`})
 return customerDashboard(token)
}

export async function verifyCustomerDomain(token:string){const order=await paidOrder(token),row=await hostingRow(order.id);if(!row?.domain)throw new AppError('Renseignez d’abord votre domaine.',400);await enqueueJob('hosting.domain_check',{orderId:order.id,domain:row.domain},{priority:20,idempotencyKey:`hosting-domain:${order.id}:${row.domain}:${Math.floor(Date.now()/30000)}`});return {queued:true}}
export async function checkHostingDomain(orderId:string,domain:string){
 return withHostingLock(orderId,()=>checkHostingDomainLocked(orderId,domain))
}
async function checkHostingDomainLocked(orderId:string,domain:string){
 const [order]=await sql()<PaidOrder[]>`select * from website_orders where id=${orderId} and status='PAID'`,row=await hostingRow(orderId)
 if(!order||!row||row.domain!==domain||!hostingAccess(row))return {ignored:true}
 if(!order.livemode){await sql()`update website_hosting set domain_status='SIMULATED' where order_id=${orderId}`;return {simulated:true}}
 if(row.deploy_status!=='READY'){await scheduleDomainRecheck(row,domain);return {waitingForPublication:true}}
 const settings=await getSettings(),dns=await domainDnsStatus(domain,row.domain_challenge!,settings.hosting.serverIp)
 if(!dns.owned||!dns.pointsHere){await sql()`update website_hosting set domain_status='PENDING_DNS' where order_id=${orderId}`;await scheduleDomainRecheck(row,domain);return {dnsPending:true}}
 try{
 if(!['MAPPED','PENDING_TLS','ACTIVE'].includes(row.domain_status)){
  await mapO2Domain(order.id,domain)
  await sql()`update website_hosting set domain_status='MAPPED',last_error=null where order_id=${order.id}`
 }
 const ready=await domainHttpsReady(domain,settings.hosting.serverIp)
 await sql()`update website_hosting set domain_status=${ready?'ACTIVE':'PENDING_TLS'},last_error=null,deploy_url=case when ${ready} then ${'https://'+domain+'/'} else provider_site_url end where order_id=${order.id} and domain=${domain}`
 if(!ready)await scheduleDomainRecheck(row,domain)
 return {ready}
 }catch{await sql()`update website_hosting set last_error='La connexion du domaine n’a pas abouti. Vérifiez les DNS, puis relancez la vérification ou contactez le vendeur.' where order_id=${order.id}`;throw new AppError('Connexion du domaine interrompue. Vous pouvez relancer sa vérification.',502)}
}
async function scheduleDomainRecheck(row:HostingRow,domain:string){if(row.domain_requested_at&&Date.now()-new Date(row.domain_requested_at).getTime()<2*86400000)await enqueueJob('hosting.domain_check',{orderId:row.order_id,domain},{priority:80,runAt:new Date(Date.now()+300000),idempotencyKey:`domain-recheck:${row.order_id}:${Math.floor(Date.now()/300000)}`})}

export async function sweepHosting(){const rows=await sql()< {order_id:string;stripe_subscription_id:string;livemode:boolean}[]>`select h.order_id,h.stripe_subscription_id,o.livemode from website_hosting h join website_orders o on o.id=h.order_id where h.stripe_subscription_id is not null and h.subscription_status in ('active','past_due','payment_pending') and (h.current_period_end<now() or h.subscription_checked_at<now()-interval '1 hour') limit 50`;for(const row of rows){await processHostingStripeEvent({id:`reconcile-${row.order_id}-${Date.now()}`,type:'customer.subscription.updated',livemode:row.livemode,data:{object:{id:row.stripe_subscription_id,metadata:{hosting_order_id:row.order_id}}}})}return {checked:rows.length}}
