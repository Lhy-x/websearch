import Stripe from 'stripe'
import { getSecret, getSettings, getPreviewBaseUrl } from '../core/settings'
import { env } from '../core/env'
import { AppError } from '../core/errors'

export function publicBase(live=false,base?:string) {
 const u=new URL(base||env().APP_BASE_URL)
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new AppError('Adresse publique invalide',400)
 if(live&&(u.protocol!=='https:'||/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[|.*\.local$)/i.test(u.hostname)))throw new AppError('Le paiement réel nécessite une adresse de démo publique HTTPS dans Paramètres → Paiement.',400,'PUBLIC_URL_REQUIRED')
 return u.origin
}
export function stripeUrl(value:unknown):string|null {
 if(typeof value!=='string')return null
 try {const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='stripe.com'||u.hostname.endsWith('.stripe.com'))?u.href:null}catch{return null}
}
export async function stripeCredentials(live:boolean) {
 const [legacyKey,legacyWebhook,testKey,testWebhook]=await Promise.all([getSecret('STRIPE_SECRET_KEY'),getSecret('STRIPE_WEBHOOK_SECRET'),getSecret('STRIPE_TEST_SECRET_KEY'),getSecret('STRIPE_TEST_WEBHOOK_SECRET')])
 if(live)return {key:/^(sk|rk)_live_/.test(legacyKey)?legacyKey:'',webhook:/^(sk|rk)_live_/.test(legacyKey)?legacyWebhook:''}
 return {key:testKey||(/^(sk|rk)_test_/.test(legacyKey)?legacyKey:''),webhook:testKey?testWebhook:(/^(sk|rk)_test_/.test(legacyKey)?legacyWebhook:'')}
}
export async function billingSetup() {
 const settings=await getSettings()
 const {key,webhook}=await stripeCredentials(settings.launch.mode==='live')
 const base=await getPreviewBaseUrl(settings)
 const live=settings.launch.mode==='live'
 const keyOk=/^(sk|rk)_(test|live)_/.test(key)
 let reason=''
 if(!settings.commerce.enabled)reason='Paiement désactivé'
 else if(!settings.commerce.priceCents)reason='Définissez le prix unique'
 else if(!keyOk)reason='Ajoutez votre clé secrète Stripe'
 else if(live&&!/^(sk|rk)_live_/.test(key)||!live&&!/^(sk|rk)_test_/.test(key))reason=live?'Le mode production nécessite une clé Stripe réelle sk_live_…':'Le mode test nécessite une clé Stripe de test sk_test_…'
 else if(!webhook)reason='Ajoutez le secret du webhook Stripe'
 else {try{publicBase(live,base)}catch(e){reason=(e as Error).message}}
 return {ready:!reason,reason,live,commerce:settings.commerce,base,previewBaseUrl:settings.sites.previewBaseUrl}
}
export async function stripeClient(live?:boolean) {
 const {key}=await stripeCredentials(live??(await getSettings()).launch.mode==='live')
 if(!key)throw new AppError('Stripe non configuré',503)
 return new Stripe(key,{maxNetworkRetries:2,timeout:20000,httpClient:Stripe.createFetchHttpClient(stripeFetch as typeof fetch)})
}
// Importing undici v8 (safe-fetch) routes Node's global fetch through its stricter core, which rejects the duplicate
// Content-Length that fetch appends to the one Stripe sets ("invalid content-length header", nodejs/undici#5500).
// fetch computes the length from the body itself. Resolved at call time so tests can stub globalThis.fetch.
function stripeFetch(input:string|URL|Request,init?:RequestInit){
 const headers=new Headers(init?.headers)
 headers.delete('content-length')
 return globalThis.fetch(input,{...init,headers})
}
