import {sql} from '@/server/core/db'
import Link from 'next/link'
import {notFound} from 'next/navigation'
import {lookupPreview} from '@/server/sites/service'
import {billingSetup} from '@/server/billing/stripe'
import {businessNameOf} from '@/server/sites/render-any'
import {formatPrice} from '@/server/proposals/service'
export const dynamic='force-dynamic'
export const metadata={title:'Commander le site',robots:{index:false,follow:false}}
export default async function BuyPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{cancelled?:string}>}) {
 const {token}=await params;const p=await lookupPreview(token);if(p.status!=='ok')notFound()
 const billing=await billingSetup();const [paid]=await sql()`select id from website_orders where website_id=${p.websiteId} and status='PAID' and livemode=${billing.live}`;const cancelled=(await searchParams).cancelled
 return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16"><p className="text-xs tracking-widest text-primary">PROSPECTFORGE · COMMANDE</p><h1 className="mt-5 text-3xl font-semibold tracking-tight">Le site de {businessNameOf(p.config)}</h1><p className="mt-4 text-sm text-muted">{billing.commerce.title}. La version présentée est conservée avec votre commande et téléchargeable après confirmation du paiement.</p>{billing.live?null:<p className="mt-4 rounded-xl bg-warning/10 p-3 text-sm text-warning">Mode test : aucun paiement réel.</p>}{cancelled?<p className="mt-4 text-sm text-muted">Paiement annulé. Vous pouvez reprendre quand vous le souhaitez.</p>:null}{paid?<p className="my-8 rounded-xl border border-border p-5 text-sm">Ce site a déjà été réglé. Retrouvez votre lien privé de confirmation pour accéder au téléchargement et à la facture.</p>:billing.ready?<><p className="my-8 text-4xl font-semibold">{formatPrice(billing.commerce.priceCents,billing.commerce.currency.toUpperCase())}</p><form method="post" action={`/buy/${token}/checkout`}><button className="h-12 w-full rounded-xl bg-primary px-5 font-medium text-primary-fg">Payer avec Stripe</button></form><p className="mt-4 text-xs leading-relaxed text-muted">Vos coordonnées de facturation sont collectées par Stripe. La facture sera disponible après paiement. L’hébergement et les prestations complémentaires ne sont inclus que si convenus avec le vendeur.</p></>:<p className="my-8 rounded-xl border border-border p-5 text-sm">Le paiement n’est pas disponible pour le moment. Contactez le vendeur.</p>}<Link className="mt-8 text-sm text-primary" href={`/preview/${token}`}>Retour à la démonstration</Link></main>
}
