import Link from 'next/link'
import { Suspense } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PeriodFilter } from '@/components/period-filter'
import { Stat } from '@/components/stat'
import { TimeSeries } from '@/components/charts'
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives'
import { dashboardMetrics } from '@/server/analytics/dashboard'
import { parsePeriod } from '@/server/analytics/period'
import { fmtEur, fmtInt, fmtPct, fmtRelative, fmtUsd } from '@/lib/utils'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const period = parsePeriod(await searchParams)
  const d = await dashboardMetrics(period)
  return (
    <>
      <PageHeader title="Dashboard" description={`Activité — ${period.label}. Toutes les valeurs proviennent de la base de données.`} actions={<Suspense><PeriodFilter /></Suspense>} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Prospects (total)" value={fmtInt(d.prospects.total)} href="/prospects" />
        <Stat label="Nouveaux prospects" value={fmtInt(d.prospects.new)} hint="créés sur la période" />
        <Stat label="Prospects qualifiés" value={fmtInt(d.prospects.qualified)} hint="score ≥ 55" href="/prospects?minScore=55" />
        <Stat label="Sans site confirmé" value={fmtInt(d.prospects.no_site_confirmed)} hint={`+ ${fmtInt(d.prospects.no_site_known)} sans site connu`} href="/prospects?presence=NO_WEBSITE_CONFIRMED" />
        <Stat label="Sites générés" value={fmtInt(d.sites.generated)} hint="sur la période" href="/sites" />
        <Stat label="Démos en ligne" value={fmtInt(d.sites.published)} hint="actives, non expirées" />
        <Stat label="Campagnes actives" value={fmtInt(d.campaignsActive)} href="/campaigns" />
        <Stat label="Emails envoyés" value={fmtInt(d.messages.sent)} hint={`${fmtInt(d.messages.unique_prospects)} prospects uniques`} />
        <Stat label="Emails délivrés" value={fmtInt(d.messages.delivered)} hint={`${fmtPct(d.messages.delivered, d.messages.sent)} des envoyés · ${fmtInt(d.messages.bounced)} rejetés`} />
        <Stat label="Réponses reçues" value={fmtInt(d.replies.replies)} hint={`hors absences et rebonds`} href="/inbox" />
        <Stat label="Réponses positives" value={fmtInt(d.replies.positive)} hint="intéressé ou demande de RDV" tone="success" />
        <Stat label="Rendez-vous" value={fmtInt(d.meetings.inPeriod)} hint={`${fmtInt(d.meetings.current)} prospects au statut RDV`} />
        <Stat label="Clients signés" value={fmtInt(d.won.won)} hint="opportunités gagnées" href="/crm" />
        <Stat label="CA signé" value={fmtEur(d.won.revenue)} hint={`encaissé : ${fmtEur(d.won.paid)}`} />
        <Stat label="Coûts API" value={fmtUsd(d.apiCostUsd)} hint="IA et services payants" href="/analytics" />
        <Stat label="Tâches en cours" value={fmtInt(d.jobs.running)} hint={`${fmtInt(d.jobs.pending)} en attente`} href="/automations" />
        <Stat label="Tâches échouées" value={fmtInt(d.jobs.failed)} tone={d.jobs.failed ? 'danger' : undefined} href="/automations?status=FAILED" />
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Évolution" description="Prospects créés, emails envoyés et réponses par jour" />
          <CardBody>
            <TimeSeries data={d.series} series={[{ key: 'prospects', label: 'Prospects' }, { key: 'sent', label: 'Emails envoyés' }, { key: 'replies', label: 'Réponses' }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Erreurs récentes" actions={<Link className="text-xs text-primary" href="/automations?status=FAILED">Tout voir</Link>} />
          {d.errors.length ? (
            <ul className="divide-y divide-border">
              {d.errors.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <Link href={`/automations/${e.id}`} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{e.type} · <span className="font-normal text-muted">{fmtRelative(e.finished_at)}</span></span>
                      <span className="line-clamp-2 text-xs text-muted">{e.error}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucune erreur" description="Aucune tâche en échec." />
          )}
        </Card>
      </div>
    </>
  )
}
