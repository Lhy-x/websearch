import { notFound } from 'next/navigation'
import { CircleCheck, Clock3, Download, FileText, Layers2 } from 'lucide-react'
import { getPurchase } from '@/server/billing/orders'
import { formatPrice } from '@/server/proposals/service'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/primitives'
import { PaymentRefresh } from './status'
import { CustomerDashboard } from '@/components/customer-dashboard'
import { customerDashboard } from '@/server/hosting/service'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Votre commande', robots: { index: false, follow: false } }
export default async function PurchasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const order = await getPurchase(token); if (!order) notFound()
  const paid = order.status === 'PAID', failed = ['FAILED','EXPIRED'].includes(order.status)
  if(paid)return <CustomerDashboard token={token} initial={await customerDashboard(token)}/>
  return <main className="public-checkout"><div className="checkout-card"><div className="checkout-brand"><Layers2 size={22}/>ProspectForge<span className="ml-auto text-[10px] font-normal text-muted">Votre commande</span></div><span className={`mb-6 inline-flex rounded-2xl p-4 ${paid?'bg-primary/8 text-primary':'bg-panel-2 text-muted'}`}>{paid?<CircleCheck size={28}/>:<Clock3 size={28}/>}</span><h1>{paid?'Paiement confirmé':failed?'Le paiement n’a pas abouti':'Vérification du paiement'}</h1><p className="checkout-copy">{order.business_name} · {formatPrice(order.amount_cents,order.currency)}</p>{!order.livemode?<div className="mt-5"><Notice tone="warning">Commande de test — aucun paiement réel.</Notice></div>:null}{paid?<div className="mt-7 space-y-4"><p className="text-xs leading-7 text-muted">Votre site est prêt à être téléchargé. Ce fichier ZIP contient la version achetée, à conserver ou à transmettre pour son hébergement.</p><Button className="w-full" size="lg" asChild><a href={`/purchase/${token}/download`}><Download/>Télécharger mon site</a></Button>{order.invoice_url?<Button variant="outline" className="w-full" asChild><a href={order.invoice_url} rel="noopener noreferrer"><FileText/>Consulter la facture Stripe</a></Button>:<PaymentRefresh invoice/>}{order.invoice_pdf?<a className="block text-center text-xs text-primary" href={order.invoice_pdf}>Télécharger la facture PDF</a>:null}</div>:failed?<p className="mt-6 text-xs leading-7 text-muted">Aucun téléchargement n’est débloqué. Contactez le vendeur si vous souhaitez reprendre votre commande.</p>:<PaymentRefresh/>}<div className="checkout-footer"><p className="leading-6">Conservez ce lien privé pour retrouver votre commande, votre site et votre facture.</p></div></div></main>
}
