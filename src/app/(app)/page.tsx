import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Globe2, Plus, Sparkles } from 'lucide-react'
import { Card, CardBody, CardHeader, EmptyState, Badge } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { WORKFLOW, NextAction } from '@/components/workflow'
import { sql } from '@/server/core/db'
import { aiAvailability } from '@/server/ai/client'
import { billingSetup } from '@/server/billing/stripe'
import { getSettings } from '@/server/core/settings'
import { fmtRelative } from '@/lib/utils'

export const metadata = { title: 'Vue d’ensemble' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const db = sql()
  const [[count], ai, billing, settings, sites] = await Promise.all([
    db<{ prospects: number; sites: number; emails: number; sales: number }[]>`select
      (select count(*)::int from businesses where archived_at is null and merged_into is null) prospects,
      (select count(*)::int from generated_websites where deleted_at is null and status='READY') sites,
      (select count(distinct p.website_id)::int from proposals p join generated_websites w on w.id=p.website_id where w.deleted_at is null) emails,
      (select count(*)::int from website_orders where status='PAID' and livemode) sales`,
    aiAvailability(), billingSetup(), getSettings(),
    db<{ id: string; name: string; city: string | null; status: string; created_at: Date }[]>`select w.id,b.name,b.city,w.status,w.created_at from generated_websites w join businesses b on b.id=w.business_id where w.deleted_at is null order by w.created_at desc limit 4`,
  ])
  const counts = count ?? { prospects: 0, sites: 0, emails: 0, sales: 0 }
  const next = !counts.prospects ? { title: 'Tout commence par une entreprise.', description: 'Choisissez une ville et une activité pour trouver vos premiers prospects.', href: '/search', action: 'Trouver un prospect' }
    : !ai.available ? { title: 'Connectez votre IA, puis créez.', description: 'Une seule configuration pour générer des sites personnalisés.', href: '/settings?tab=ai', action: 'Connecter mon IA' }
    : !counts.sites ? { title: 'Votre premier site vous attend.', description: 'Sélectionnez une entreprise. Un clic lance la création sur mesure.', href: '/generator', action: 'Créer mon premier site' }
    : !counts.emails ? { title: 'Votre démo mérite d’être vue.', description: 'Préparez un email personnalisé et partagez votre création avec le prospect.', href: '/sites', action: 'Préparer ma proposition' }
    : !billing.ready ? { title: 'Prêt à proposer le paiement ?', description: 'Ajoutez votre prix unique et configurez Stripe quand vous souhaitez vendre.', href: '/settings?tab=payment', action: 'Configurer le paiement' }
    : { title: 'Un nouveau projet à lancer ?', description: 'Vos démos, propositions et paiements restent accessibles depuis votre espace.', href: '/generator', action: 'Créer un autre site' }
  const metrics = [
    { label: 'Mes prospects', value: counts.prospects, hint: 'Entreprises dans votre base', href: '/prospects' },
    { label: 'Démos prêtes', value: counts.sites, hint: 'Sites prêts à présenter', href: '/sites' },
    { label: 'Propositions préparées', value: counts.emails, hint: 'Démos avec un brouillon email', href: '/sites' },
    { label: 'Ventes confirmées', value: counts.sales, hint: 'Paiements réels reçus', href: '/sales' },
  ]
  const setup = [
    { title: 'Mon intelligence artificielle', ready: ai.available, hint: ai.available ? 'Prête à créer vos sites' : 'À connecter pour créer sur mesure', href: '/settings?tab=ai' },
    { title: 'Ma signature email', ready: !!settings.outreach.senderName && !!settings.outreach.senderEmail, hint: settings.outreach.senderEmail || 'Personnalisez vos propositions', href: '/settings?tab=outreach' },
    { title: 'Mon paiement Stripe', ready: billing.ready, hint: billing.ready ? billing.live ? 'Configuration réelle enregistrée' : 'Configuration de test enregistrée' : 'À configurer pour encaisser', href: '/settings?tab=payment' },
  ]
  return <>
    <div className="overview-welcome"><div><p className="eyebrow">VOTRE ATELIER, EN UN COUP D’ŒIL</p><h1>Faisons avancer vos projets.</h1><p>Une entreprise. Une belle démo. Votre prochain client.</p></div><div className="overview-actions"><Button asChild><Link href="/generator"><Plus/>Créer un site</Link></Button><Button variant="outline" asChild><Link href="/search">Trouver des prospects<ArrowUpRight/></Link></Button></div></div>
    <div className="metric-grid">{metrics.map((m, index) => <Link key={m.href + m.label} href={m.href} className={`metric-card ${index === 0 ? 'featured' : ''}`}><div className="metric-top">{m.label}<span><ArrowUpRight size={15}/></span></div><strong className="metric-value tabular">{m.value}</strong><p className="metric-hint">{m.hint}</p></Link>)}</div>
    <NextAction {...next}/>
    <div className="overview-grid">
      <Card><CardHeader title="De la rencontre à la vente" description="Quatre étapes. Toujours une prochaine action claire." actions={<Link href="/guide" className="flex items-center gap-1 text-xs text-muted">Le guide<ArrowUpRight size={14}/></Link>}/><CardBody><div className="journey-cards">{WORKFLOW.map((step, i) => <Link href={step.href} key={step.href} className="journey-card"><span className="journey-number">0{i + 1}</span><span className="journey-card-icon"><step.icon size={19}/></span><h3>{step.title}</h3><p>{step.description}</p><span className="journey-arrow">C’est parti <ArrowRight size={14}/></span></Link>)}</div></CardBody></Card>
      <div className="space-y-5"><Card><CardHeader title="Votre espace est-il prêt ?" description="Ces réglages sont conservés pour les prochains projets."/><CardBody className="pt-2"><div className="setup-list">{setup.map((s, i) => <Link href={s.href} key={s.href} className="setup-item"><span className={`setup-state ${s.ready ? 'is-ready' : ''}`}>{s.ready ? <Check size={14}/> : i + 1}</span><span><strong>{s.title}</strong><small>{s.hint}</small></span><ChevronRight size={15}/></Link>)}</div></CardBody></Card><Card><CardBody><div className="mb-3 flex items-center gap-2 text-primary"><Sparkles size={17}/><span className="text-xs font-medium">Votre méthode, vos créations</span></div><p className="text-xs leading-7 text-muted">Chaque site est conçu à partir de l’entreprise choisie. Vous gardez la main sur les textes, la démo et l’email avant de les partager.</p></CardBody></Card></div>
    </div>
    <Card className="mt-6"><CardHeader title="Vos dernières créations" description="Reprenez là où vous en étiez." actions={<Link href="/sites" className="flex items-center gap-1 text-xs text-primary">Toutes mes démos <ArrowUpRight size={14}/></Link>}/>{sites.length ? <CardBody className="pt-1">{sites.map(s => <Link href={s.status === 'READY' ? `/sites/${s.id}` : '/generator'} className="activity-row" key={s.id}><span className="activity-icon"><Globe2 size={18}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-[13px] font-medium">{s.name}</strong><small className="mt-1 block text-[11px] text-muted">{s.city ? s.city + ' · ' : ''}{fmtRelative(s.created_at)}</small></span><Badge tone={s.status === 'READY' ? 'success' : s.status === 'ERROR' ? 'danger' : 'neutral'}>{{ READY: 'Prête', GENERATING: 'En création', ERROR: 'À reprendre', DISABLED: 'Désactivée' }[s.status] ?? s.status}</Badge><ChevronRight size={16} className="text-muted"/></Link>)}</CardBody> : <EmptyState icon={<Globe2/>} title="L’atelier est à vous" description="Votre première création apparaîtra ici. Commencez par choisir une entreprise." action={<Button variant="outline" asChild><Link href="/search">Trouver ma première entreprise<ArrowRight/></Link></Button>}/>}</Card>
  </>
}
