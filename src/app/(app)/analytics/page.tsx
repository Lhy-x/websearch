import { Suspense } from 'react'
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from '@/components/ui/primitives'
import { PeriodFilter } from '@/components/period-filter'
import { Stat } from '@/components/stat'
import { Bars } from '@/components/charts'
import { analytics } from '@/server/analytics/analytics'
import { parsePeriod } from '@/server/analytics/period'
import { SECTOR_BY_ID } from '@/lib/sectors'
import { fmtEur, fmtInt, fmtPct, fmtUsd } from '@/lib/utils'

export const metadata = { title: 'Analytics' }
export const dynamic = 'force-dynamic'

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const p = parsePeriod(await searchParams)
  const a = await analytics(p)
  const f = a.funnel
  return (
    <>
      <PageHeader title="Analytics" description={`${p.label}. Chaque taux indique son dénominateur ; emails envoyés, délivrés et prospects uniques ne sont jamais mélangés.`} actions={<Suspense><PeriodFilter /></Suspense>} />
      <h2 className="mb-2 text-sm font-semibold">Indicateurs commerciaux</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Prospects trouvés" value={fmtInt(f.found)} />
        <Stat label="Prospects qualifiés" value={fmtInt(f.qualified)} hint={`${fmtPct(f.qualified, f.found)} des trouvés`} />
        <Stat label="Avec email pro" value={fmtInt(f.with_email)} hint={`${fmtPct(f.with_email, f.found)} des trouvés`} />
        <Stat label="Emails envoyés" value={fmtInt(f.sent)} hint={`à ${fmtInt(f.contacted)} prospects uniques`} />
        <Stat label="Taux de livraison" value={fmtPct(f.delivered, f.sent)} hint={`${fmtInt(f.delivered)} délivrés / ${fmtInt(f.sent)} envoyés`} />
        <Stat label="Taux de rejet" value={fmtPct(f.bounced, f.sent)} hint={`${fmtInt(f.bounced)} / ${fmtInt(f.sent)} envoyés`} />
        <Stat label="Taux de réponse" value={fmtPct(f.replied, f.contacted)} hint={`${fmtInt(f.replied)} prospects / ${fmtInt(f.contacted)} contactés`} />
        <Stat label="Réponse positive" value={fmtPct(f.positive, f.contacted)} hint={`${fmtInt(f.positive)} / ${fmtInt(f.contacted)} contactés`} />
        <Stat label="Taux de RDV" value={fmtPct(f.meetings, f.contacted)} hint={`${fmtInt(f.meetings)} / ${fmtInt(f.contacted)} contactés`} />
        <Stat label="Conversion" value={fmtPct(f.won, f.contacted)} hint={`${fmtInt(f.won)} clients / ${fmtInt(f.contacted)} contactés`} />
        <Stat label="CA signé" value={fmtEur(f.revenue)} />
        <Stat label="CA encaissé" value={fmtEur(f.paid)} hint="si renseigné" />
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Indicateurs techniques</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Sites générés" value={fmtInt(Number(a.tech.sites))} hint={`${fmtInt(Number(a.tech.sites_error))} en erreur`} />
        <Stat label="Durée moy. génération" value={`${(Number(a.tech.avg_gen_ms) / 1000).toFixed(1)} s`} />
        <Stat label="Coût moyen / génération" value={fmtUsd(a.tech.avg_gen_cost)} />
        <Stat label="Coût IA total" value={fmtUsd(a.tech.ai_cost)} />
        <Stat label="Coût d’enrichissement" value={fmtUsd(a.tech.enrichment_cost)} hint="API payantes hors IA" />
        <Stat label="Tâches échouées" value={fmtInt(Number(a.tech.jobs_failed))} hint={`${fmtInt(Number(a.tech.jobs_done))} réussies · moy. ${a.tech.avg_job_s} s`} />
      </div>
      <Card className="mt-6"><CardHeader title="Par semaine" /><CardBody><Bars data={a.weekly} xKey="week" series={[{ key: 'sent', label: 'Envoyés' }, { key: 'replies', label: 'Réponses' }, { key: 'positive', label: 'Positives' }]} /></CardBody></Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Segment title="Par ville" rows={a.byCity} />
        <Segment title="Par secteur" rows={a.bySector.map((r) => ({ ...r, key: r.key && SECTOR_BY_ID.get(r.key)?.label ? SECTOR_BY_ID.get(r.key)!.label : r.key }))} />
        <Card>
          <CardHeader title="Par campagne" />
          <Table><thead><tr><Th>Campagne</Th><Th className="text-right">Envoyés</Th><Th className="text-right">Contactés</Th><Th className="text-right">Réponse / contactés</Th><Th className="text-right">Positives / contactés</Th></tr></thead>
            <tbody>{a.byCampaign.map((r) => <tr key={r.key}><Td>{r.key}</Td><Td className="tabular text-right">{r.sent}</Td><Td className="tabular text-right">{r.contacted}</Td><Td className="tabular text-right">{fmtPct(r.replied, r.contacted)}</Td><Td className="tabular text-right">{fmtPct(r.positive, r.contacted)}</Td></tr>)}</tbody></Table>
        </Card>
        <Card>
          <CardHeader title="Par template" description="Démos générées, vues, et prospects contactés / positifs" />
          <Table><thead><tr><Th>Template</Th><Th className="text-right">Sites</Th><Th className="text-right">Vues</Th><Th className="text-right">Contactés</Th><Th className="text-right">Positifs / contactés</Th></tr></thead>
            <tbody>{a.byTemplate.map((r) => <tr key={r.key}><Td>{r.key}</Td><Td className="tabular text-right">{r.sites}</Td><Td className="tabular text-right">{r.views}</Td><Td className="tabular text-right">{r.contacted}</Td><Td className="tabular text-right">{fmtPct(r.positive, r.contacted)}</Td></tr>)}</tbody></Table>
        </Card>
        <Card>
          <CardHeader title="Par modèle IA" />
          <Table><thead><tr><Th>Modèle</Th><Th className="text-right">Appels</Th><Th className="text-right">Échecs</Th><Th className="text-right">Tokens in/out</Th><Th className="text-right">Coût</Th></tr></thead>
            <tbody>{a.byModel.map((r) => <tr key={r.key}><Td>{r.key}</Td><Td className="tabular text-right">{r.calls}</Td><Td className="tabular text-right">{r.failures}</Td><Td className="tabular text-right">{fmtInt(r.input_tokens)} / {fmtInt(r.output_tokens)}</Td><Td className="tabular text-right">{fmtUsd(r.cost)}</Td></tr>)}{!a.byModel.length ? <tr><Td colSpan={5} className="text-muted">Aucun appel IA sur la période.</Td></tr> : null}</tbody></Table>
        </Card>
        <Card>
          <CardHeader title="Par offre" />
          <Table><thead><tr><Th>Offre</Th><Th className="text-right">Opportunités</Th><Th className="text-right">Gagnées</Th><Th className="text-right">CA</Th></tr></thead>
            <tbody>{a.byOffer.map((r) => <tr key={r.key}><Td>{r.key}</Td><Td className="tabular text-right">{r.opportunities}</Td><Td className="tabular text-right">{r.won}</Td><Td className="tabular text-right">{fmtEur(r.revenue)}</Td></tr>)}{!a.byOffer.length ? <tr><Td colSpan={4} className="text-muted">Aucune opportunité.</Td></tr> : null}</tbody></Table>
        </Card>
      </div>
    </>
  )
}

function Segment({ title, rows }: { title: string; rows: { key: string | null; prospects: number; contacted: number; replied: number; positive: number; won: number }[] }) {
  return (
    <Card>
      <CardHeader title={title} description="Taux = prospects / prospects contactés sur la période" />
      <Table>
        <thead><tr><Th>Segment</Th><Th className="text-right">Prospects</Th><Th className="text-right">Contactés</Th><Th className="text-right">Réponse</Th><Th className="text-right">Positive</Th><Th className="text-right">Clients</Th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key ?? '—'}><Td>{r.key ?? '—'}</Td><Td className="tabular text-right">{fmtInt(r.prospects)}</Td><Td className="tabular text-right">{fmtInt(r.contacted)}</Td><Td className="tabular text-right">{fmtPct(r.replied, r.contacted)}</Td><Td className="tabular text-right">{fmtPct(r.positive, r.contacted)}</Td><Td className="tabular text-right">{fmtInt(r.won)}</Td></tr>)}</tbody>
      </Table>
    </Card>
  )
}
