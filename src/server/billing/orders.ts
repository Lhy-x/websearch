import Stripe from 'stripe'
import { sql } from '../core/db'
import { AppError } from '../core/errors'
import { randomToken } from '../core/crypto'
import { lookupPreview, getWebsiteVersion } from '../sites/service'
import { websiteVersionSchema } from '@/lib/site/bespoke-schema'
import { billingSetup, publicBase, stripeClient, stripeUrl } from './stripe'
import { getSecret } from '../core/settings'

export async function createCheckout(token:string) {
 const setup=await billingSetup()
 if(!setup.ready)throw new AppError(setup.reason,503,'PAYMENT_UNAVAILABLE')
 const preview=await lookupPreview(token)
 if(preview.status!=='ok')throw new AppError('Cette démonstration n’est plus disponible',410)
 const version=await getWebsiteVersion(preview.websiteId)
 if(!version)throw new AppError('Aucune version disponible',404)
 const db=sql()
 const [site]=await db<{business_name:string}[]>`select b.name business_name from generated_websites w join businesses b on b.id=w.business_id where w.id=${preview.websiteId}`
 const amount=setup.commerce.priceCents!
 const order=await db.begin(async tx=>{
  const [locked]=await tx`select id from generated_websites where id=${preview.websiteId} and deleted_at is null and status='READY' and preview_enabled and (preview_expires_at is null or preview_expires_at>now()) for update`
  if(!locked)throw new AppError('Démo indisponible',410)
  const [paid]=await tx`select id from website_orders where website_id=${preview.websiteId} and livemode=${setup.live} and status='PAID'`
  if(paid)throw new AppError('Ce site a déjà été réglé. Utilisez votre lien de confirmation.',409,'ALREADY_PAID')
  await tx`insert into website_orders(website_id,business_id,business_name,version,snapshot,amount_cents,currency,livemode,access_token)
   values(${preview.websiteId},${preview.businessId},${site!.business_name},${version.version},${tx.json(version.config as never)},${amount},${setup.commerce.currency},${setup.live},${randomToken(32)}) on conflict do nothing`
  const [row]=await tx<{id:string;access_token:string;checkout_url:string|null;checkout_params:Stripe.Checkout.SessionCreateParams|null;amount_cents:number;currency:string;status:string;created_at:Date}[]>`select * from website_orders where website_id=${preview.websiteId} and livemode=${setup.live} and status in ('CREATING','OPEN','PENDING') order by created_at desc limit 1`
  if(!row)throw new AppError('Commande déjà traitée. Rechargez la page.',409)
  return row
 })
 if(order.status==='PENDING')throw new AppError('Paiement en cours de vérification. Consultez votre confirmation.',409)
 const stripe=await stripeClient()
 if(order.checkout_url&&order.status==='OPEN') {
  // Check expiry rather than returning an old dead URL when an expiry webhook was missed.
  const [stored]=await db<{stripe_session_id:string}[]>`select stripe_session_id from website_orders where id=${order.id}`
  let session:Stripe.Checkout.Session
  try{session=await stripe.checkout.sessions.retrieve(stored!.stripe_session_id)}catch{throw new AppError('Impossible de vérifier la session Stripe existante. Vérifiez le compte Stripe configuré.',503)}
  if(session.status==='open'&&stripeUrl(session.url))return stripeUrl(session.url)!
  if(session.status==='expired'){await db`update website_orders set status='EXPIRED' where id=${order.id} and status='OPEN'`;return createCheckout(token)}
  throw new AppError('Paiement en cours de vérification. Consultez votre confirmation.',409)
 }
 const base=publicBase(setup.live,setup.base)
 try {
  const proposed:Stripe.Checkout.SessionCreateParams={mode:'payment',client_reference_id:order.id,customer_creation:'always',billing_address_collection:'required',tax_id_collection:{enabled:true},invoice_creation:{enabled:true,invoice_data:{metadata:{order_id:order.id}}},metadata:{order_id:order.id},line_items:[{quantity:1,...(setup.commerce.taxRateId?{tax_rates:[setup.commerce.taxRateId]}:{}),price_data:{tax_behavior:'inclusive',currency:order.currency,unit_amount:order.amount_cents,product_data:{name:setup.commerce.title,description:site!.business_name}}}],success_url:`${base}/purchase/${order.access_token}`,cancel_url:`${base}/buy/${token}?cancelled=1`}
  await db`update website_orders set checkout_params=${db.json(proposed as never)} where id=${order.id} and checkout_params is null`
  const [saved]=await db<{checkout_params:Stripe.Checkout.SessionCreateParams}[]>`select checkout_params from website_orders where id=${order.id}`
  const session=await stripe.checkout.sessions.create(saved!.checkout_params,{idempotencyKey:`website-order:${order.id}`})
  const url=stripeUrl(session.url)
  if(!url)throw new Error('URL Stripe manquante')
  await db`update website_orders set stripe_session_id=${session.id},checkout_url=${url},status=case when status='CREATING' then 'OPEN' else status end where id=${order.id}`
  return url
 } catch(error) {
  // Leave CREATING for network retries: the Stripe idempotency key prevents duplicate sessions.
  if(error instanceof Stripe.errors.StripeAuthenticationError||error instanceof Stripe.errors.StripePermissionError||error instanceof Stripe.errors.StripeInvalidRequestError) await db`update website_orders set status='FAILED' where id=${order.id} and status='CREATING'`
  if(error instanceof AppError)throw error
  throw new AppError('Stripe ne peut pas ouvrir le paiement pour le moment. Réessayez ou contactez le vendeur.',502,'STRIPE_UNAVAILABLE')
 }
}

const ref=(value:unknown)=>typeof value==='string'?value:typeof value==='object'&&value&&'id' in value?String(value.id):null
export async function processStripeEvent(event:Stripe.Event) {
 const obj=event.data.object as unknown as Record<string,unknown>
 const metadata=obj.metadata as {order_id?:string}|null
 const orderId=metadata?.order_id
 if(!orderId||!/^[0-9a-f-]{36}$/i.test(orderId))return {ignored:true}
 const allowed=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','invoice.paid','invoice.finalized']
 if(!allowed.includes(event.type))return {ignored:true}
 const [lock]=await sql()<{website_id:string|null}[]>`select website_id from website_orders where id=${orderId}`
 return sql().begin(async tx=>{
  if(lock?.website_id)await tx`select id from generated_websites where id=${lock.website_id} for update`
  const [order]=await tx<{id:string;website_id:string|null;business_id:string|null;business_name:string;amount_cents:number;currency:string;livemode:boolean;status:string;stripe_session_id:string|null}[]>`select * from website_orders where id=${orderId} for update`
  if(!order)return {ignored:true}
  if(order.livemode!==event.livemode)throw new AppError('Mode Stripe incohérent',400)
  const [seen]=await tx`insert into stripe_events(id,type) values(${event.id},${event.type}) on conflict do nothing returning id`
  if(!seen)return {duplicate:true}
  if(event.type.startsWith('invoice.')) {
   if(obj.currency!==order.currency||obj.total!==order.amount_cents)throw new AppError('Montant de facture incohérent',400)
   await tx`update website_orders set stripe_invoice_id=${ref(obj)},invoice_url=coalesce(${stripeUrl(obj.hosted_invoice_url)},invoice_url),invoice_pdf=coalesce(${stripeUrl(obj.invoice_pdf)},invoice_pdf) where id=${order.id}`
   return {invoice:true}
  }
  if(order.stripe_session_id&&order.stripe_session_id!==obj.id)throw new AppError('Session Stripe incohérente',400)
  if(obj.currency!==order.currency||obj.amount_total!==order.amount_cents)throw new AppError('Montant Stripe incohérent',400)
  const paid=(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded')&&obj.payment_status==='paid'
  if(order.status==='PAID')return {alreadyPaid:true}
  const status=paid?'PAID':event.type==='checkout.session.expired'?'EXPIRED':event.type==='checkout.session.async_payment_failed'?'FAILED':'PENDING'
  await tx`update website_orders set status=${status},stripe_session_id=${String(obj.id)},stripe_invoice_id=coalesce(${ref(obj.invoice)},stripe_invoice_id),paid_at=case when ${paid} then now() else paid_at end where id=${order.id}`
  if(paid&&order.livemode&&order.business_id) {
   await tx`update businesses set pipeline_status='WON' where id=${order.business_id}`
   await tx`insert into crm_opportunities(business_id,title,amount_cents,currency,status,signed_at,paid_cents,paid_at) values(${order.business_id},${'Site — '+order.business_name},${order.amount_cents},${order.currency.toUpperCase()},'WON',now(),${order.amount_cents},now())`
  }
  return {status}
 })
}
export async function verifiedStripeEvent(raw:string,signature:string) {
 const secret=await getSecret('STRIPE_WEBHOOK_SECRET')
 if(!secret)throw new AppError('Webhook Stripe non configuré',503)
 const stripe=await stripeClient()
 try{return stripe.webhooks.constructEvent(raw,signature,secret)}catch{throw new AppError('Signature Stripe invalide',401)}
}
export async function getPurchase(token:string) {
 if(!/^[a-zA-Z0-9_-]{35,64}$/.test(token))return null
 const [order]=await sql()`select id,business_name,status,amount_cents,currency,livemode,invoice_url,invoice_pdf,snapshot,paid_at from website_orders where access_token=${token}`
 return order??null
}
export async function purchaseConfig(token:string) {
 const order=await getPurchase(token)
 if(!order)throw new AppError('Commande introuvable',404)
 if(order.status!=='PAID')throw new AppError('Paiement non confirmé',409)
 return websiteVersionSchema.parse(order.snapshot)
}

export async function expireWebsiteCheckouts(websiteId:string) {
 const orders=await sql()<{id:string;status:string;stripe_session_id:string|null}[]>`select id,status,stripe_session_id from website_orders where website_id=${websiteId} and status in ('CREATING','OPEN','PENDING')`
 if(orders.some(o=>o.status==='CREATING'||o.status==='PENDING'))throw new AppError('Un paiement est en cours. Attendez sa confirmation avant de supprimer le site.',409)
 if(!orders.length)return
 const stripe=await stripeClient()
 for(const order of orders) {
  try {await stripe.checkout.sessions.expire(order.stripe_session_id!)}catch{throw new AppError('Un paiement Stripe est ouvert. Fermez-le dans Stripe ou réessayez avant de supprimer le site.',409)}
  await sql()`update website_orders set status='EXPIRED' where id=${order.id} and status='OPEN'`
 }
}
