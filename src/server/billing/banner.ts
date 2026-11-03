import {sql} from '../core/db'
import {billingSetup} from './stripe'
import {formatPrice} from '../proposals/service'
export async function purchaseBanner(token:string) {
 const b=await billingSetup();if(!b.ready)return ''
 const [paid]=await sql()`select o.id from website_orders o join generated_websites w on w.id=o.website_id where w.preview_token=${token} and o.status='PAID' and o.livemode=${b.live}`
 if(paid)return ''
 const price=formatPrice(b.commerce.priceCents,b.commerce.currency.toUpperCase())
 return `<aside aria-label="Commander ce site" style="all:initial;position:fixed;bottom:16px;right:16px;z-index:2147483647;display:block;max-width:calc(100vw - 32px);box-sizing:border-box;background:#14543b;color:white;padding:14px 18px;border-radius:20px;font:14px/1.5 system-ui;box-shadow:0 8px 30px #0004"><a target="_blank" rel="noopener noreferrer" href="/buy/${token}" style="color:#fff;text-decoration:none;display:block">${b.live?'Commander ce site':'Paiement de test'} · ${price} ↗</a><span style="display:block;font-size:11px;color:#d6e9de">Paiement Stripe · facture après paiement</span></aside>`
}
