import {notFound} from 'next/navigation'
import {getPurchase} from '@/server/billing/orders'
import {formatPrice} from '@/server/proposals/service'
import {PaymentRefresh} from './status'
export const dynamic='force-dynamic'
export const metadata={title:'Votre commande',robots:{index:false,follow:false}}
export default async function PurchasePage({params}:{params:Promise<{token:string}>}) {
 const {token}=await params;const order=await getPurchase(token);if(!order)notFound()
 const paid=order.status==='PAID'
 return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16"><p className="text-xs tracking-widest text-primary">VOTRE COMMANDE</p><h1 className="mt-6 text-3xl font-semibold">{paid?'Paiement confirmé':'Vérification du paiement'}</h1><p className="mt-4 text-muted">{order.business_name} · {formatPrice(order.amount_cents,order.currency)}</p>{!order.livemode?<p className="mt-4 text-warning">Commande de test — aucun paiement réel.</p>:null}{paid?<><a className="mt-8 rounded-xl bg-primary px-5 py-4 text-center font-medium text-primary-fg" href={`/purchase/${token}/download`}>Télécharger mon site</a>{order.invoice_url?<a className="mt-4 text-primary" href={order.invoice_url} rel="noopener noreferrer">Consulter la facture Stripe</a>:<PaymentRefresh invoice/>}{order.invoice_pdf?<a className="mt-3 text-primary" href={order.invoice_pdf}>Télécharger la facture PDF</a>:null}</>:['FAILED','EXPIRED'].includes(order.status)?<p className="mt-6 text-sm text-muted">Ce paiement n’a pas abouti. Aucun téléchargement n’est débloqué.</p>:<PaymentRefresh/>}<p className="mt-8 text-xs text-muted">Conservez ce lien privé pour retrouver votre commande.</p></main>
}
