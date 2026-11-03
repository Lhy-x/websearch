import Link from 'next/link'
import {PageHeader,Card,CardBody,CardHeader} from '@/components/ui/primitives'
import {Button} from '@/components/ui/button'
import {sql} from '@/server/core/db'
import {aiAvailability} from '@/server/ai/client'
import {billingSetup} from '@/server/billing/stripe'
export const metadata={title:'Accueil'}
export const dynamic='force-dynamic'
export default async function DashboardPage() {
 const [[count],ai,billing]=await Promise.all([sql()<{prospects:number;sites:number;sales:number}[]>`select (select count(*)::int from businesses where archived_at is null and merged_into is null) prospects,(select count(*)::int from generated_websites where deleted_at is null and status='READY') sites,(select count(*)::int from website_orders where status='PAID' and livemode) sales`,aiAvailability(),billingSetup()])
 const steps=[{title:'1. Trouver un prospect',text:'Recherchez une entreprise ou importez votre liste.',href:'/search',action:'Trouver des prospects'},{title:'2. Créer sa démo',text:'Un clic pour concevoir son site sur mesure.',href:'/generator',action:'Créer un site'},{title:'3. Préparer son email',text:'Depuis la démo : un brouillon avec le lien de visite et de paiement.',href:'/sites',action:'Voir mes démos'},{title:'4. Suivre la vente',text:'Retrouvez les paiements confirmés et les factures Stripe.',href:'/sales',action:'Voir mes ventes'}]
 return <><PageHeader title="Dashboard" description="Prospect → démo → email → vente. Tout simplement."/><div className="mb-7 grid grid-cols-3 gap-3">{[['Prospects',count?.prospects??0],['Démos prêtes',count?.sites??0],['Ventes réelles',count?.sales??0]].map(([label,value])=><Card key={label}><CardBody><p className="text-xs text-muted">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></CardBody></Card>)}</div><div className="grid gap-4 md:grid-cols-2">{steps.map(step=><Card key={step.href}><CardHeader title={step.title} description={step.text}/><CardBody><Button asChild><Link href={step.href}>{step.action}</Link></Button></CardBody></Card>)}</div>{!ai.available||!billing.ready?<Card className="mt-6"><CardHeader title="À configurer une seule fois"/><CardBody className="space-y-3 text-sm">{!ai.available?<p>IA : {ai.reason}</p>:null}{!billing.ready?<p>Paiement : {billing.reason}. Les démos restent utilisables sans paiement activé.</p>:null}<Button variant="outline" asChild><Link href="/settings">Ouvrir les paramètres</Link></Button></CardBody></Card>:null}</>
}
