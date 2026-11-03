import { sql } from '@/server/core/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, CreditCard, Layers2, LockKeyhole } from 'lucide-react'
import { lookupPreview } from '@/server/sites/service'
import { billingSetup } from '@/server/billing/stripe'
import { businessNameOf } from '@/server/sites/render-any'
import { formatPrice } from '@/server/proposals/service'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/primitives'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Commander le site', robots: { index: false, follow: false } }
export default async function BuyPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { token } = await params
  const p = await lookupPreview(token); if (p.status !== 'ok') notFound()
  const billing = await billingSetup()
  const [paid] = await sql()`select id from website_orders where website_id=${p.websiteId} and status='PAID' and livemode=${billing.live}`
  const cancelled = (await searchParams).cancelled
  return <main className="public-checkout"><div className="checkout-card"><div className="checkout-brand"><Layers2 size={22}/>ProspectForge <span className="ml-auto text-[10px] font-normal text-muted">Votre nouveau site</span></div><p className="eyebrow mb-3">1. COMMANDE · 2. PAIEMENT · 3. LIVRAISON</p><h1>Le site de {businessNameOf(p.config)}</h1><p className="checkout-copy">{billing.commerce.title}. Retrouvez la version présentée en démonstration, conservée avec votre commande.</p>{!billing.live?<div className="mt-5"><Notice tone="warning">Mode test : aucun paiement réel.</Notice></div>:null}{cancelled?<p className="mt-4 text-xs text-muted">Paiement annulé. Vous pouvez reprendre quand vous le souhaitez.</p>:null}{paid?<div className="mt-6"><Notice title="Ce site a déjà été réglé">Retrouvez votre lien privé de confirmation pour accéder au téléchargement et à la facture.</Notice></div>:billing.ready?<><p className="checkout-price">{formatPrice(billing.commerce.priceCents,billing.commerce.currency.toUpperCase())}<span className="mt-1 block text-[11px] font-normal tracking-normal text-muted">Prix total · paiement unique</span></p><ul className="mb-7 space-y-3 text-xs text-muted">{['Version du site conservée avec la commande','Téléchargement du site en ZIP après confirmation','Facture générée par Stripe après paiement'].map(text=><li key={text} className="flex items-center gap-2.5"><Check className="size-4 shrink-0 text-primary"/>{text}</li>)}</ul><form method="post" action={`/buy/${token}/checkout`}><Button type="submit" size="lg" className="w-full"><CreditCard/>Payer avec Stripe<ArrowRight/></Button></form><p className="mt-4 flex items-center justify-center gap-2 text-[10px] text-muted"><LockKeyhole size={12}/>Coordonnées de paiement saisies chez Stripe</p></>:<div className="mt-6"><Notice title="Le paiement est momentanément indisponible">Contactez le vendeur pour finaliser votre commande.</Notice></div>}<div className="checkout-footer"><p className="mb-5 leading-6">L’hébergement et les prestations complémentaires ne sont inclus que si convenus avec le vendeur.</p><Link className="inline-flex items-center gap-2 text-xs font-medium text-primary" href={`/preview/${token}`}><ArrowLeft size={14}/>Retour à la démonstration</Link></div></div></main>
}
