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
export async function billingSetup() {
 const [settings,key,webhook]=await Promise.all([getSettings(),getSecret('STRIPE_SECRET_KEY'),getSecret('STRIPE_WEBHOOK_SECRET')])
 const base=await getPreviewBaseUrl(settings)
 const live=/^(sk|rk)_live_/.test(key)
 const keyOk=/^(sk|rk)_(test|live)_/.test(key)
 let reason=''
 if(!settings.commerce.enabled)reason='Paiement désactivé'
 else if(!settings.commerce.priceCents)reason='Définissez le prix unique'
 else if(!keyOk)reason='Ajoutez votre clé secrète Stripe'
 else if(!webhook)reason='Ajoutez le secret du webhook Stripe'
 else {try{publicBase(live,base)}catch(e){reason=(e as Error).message}}
 return {ready:!reason,reason,live,commerce:settings.commerce,base,previewBaseUrl:settings.sites.previewBaseUrl}
}
export async function stripeClient() {
 const key=await getSecret('STRIPE_SECRET_KEY')
 if(!key)throw new AppError('Stripe non configuré',503)
 return new Stripe(key,{maxNetworkRetries:2,timeout:20000})
}
