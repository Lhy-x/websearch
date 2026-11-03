import Link from 'next/link'
import {sql} from '@/server/core/db'
import {PageHeader,Card,CardBody,Badge,EmptyState} from '@/components/ui/primitives'
import {formatPrice} from '@/server/proposals/service'
export const dynamic='force-dynamic'
export const metadata={title:'Ventes'}
export default async function SalesPage() {
 const orders=await sql()<{id:string;business_name:string;amount_cents:number;currency:string;status:string;livemode:boolean;invoice_url:string|null;invoice_pdf:string|null;website_id:string|null;deleted_at:Date|null}[]>`select o.id,o.business_name,o.amount_cents,o.currency,o.status,o.livemode,o.invoice_url,o.invoice_pdf,o.website_id,w.deleted_at from website_orders o left join generated_websites w on w.id=o.website_id order by o.created_at desc limit 100`
 const labels:Record<string,string>={CREATING:'Ouverture du paiement',OPEN:'Paiement ouvert',PENDING:'Confirmation en attente',PAID:'Payé',FAILED:'Échec',EXPIRED:'Expiré'}
 return <><PageHeader title="Ventes" description="Les paiements confirmés par Stripe et les factures associées."/>{orders.length?<div className="space-y-3">{orders.map(o=><Card key={o.id}><CardBody><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{o.business_name}</p><p className="mt-1 text-sm text-muted">{formatPrice(o.amount_cents,o.currency)}</p></div><div className="flex gap-2"><Badge tone={o.status==='PAID'?'success':'neutral'}>{labels[o.status]}</Badge>{!o.livemode?<Badge tone="warning">Test</Badge>:null}</div></div><div className="mt-3 flex gap-4 text-sm">{o.website_id?<Link className="text-primary" href={o.deleted_at?'/sites?trash=1':`/sites/${o.website_id}`}>{o.deleted_at?'Site dans la corbeille':'Voir le site'}</Link>:null}{o.status==='PAID'&&o.invoice_url?<a className="text-primary" target="_blank" rel="noopener noreferrer" href={o.invoice_url}>Facture Stripe</a>:null}{o.status==='PAID'&&o.invoice_pdf?<a className="text-primary" href={o.invoice_pdf}>PDF</a>:null}</div></CardBody></Card>)}</div>:<Card><EmptyState title="Pas encore de paiement" description="Activez Stripe dans les paramètres, puis envoyez une démo avec son lien de commande."/></Card>}</>
}
