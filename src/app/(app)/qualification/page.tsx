import Link from 'next/link'
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/primitives'
import { Bars } from '@/components/charts'
import { Stat } from '@/components/stat'
import { sql } from '@/server/core/db'
import { PRESENCE } from '@/lib/labels'
import { fmtInt } from '@/lib/utils'
import { RescoreButton } from './rescore'

export const metadata = { title: 'Qualification' }
export const dynamic = 'force-dynamic'

export default async function QualificationPage() {
  const db = sql()
  const dist = await db<{ bucket: string; n: number }[]>`select (floor(coalesce(score,0)/10)*10)::int::text || '-' || (floor(coalesce(score,0)/10)*10+9)::int::text as bucket, count(*)::int n
    from businesses where merged_into is null and archived_at is null group by floor(coalesce(score,0)/10) order by floor(coalesce(score,0)/10)`
  const presence = await db<{ web_presence_status: string; n: number }[]>`select web_presence_status, count(*)::int n from businesses where merged_into is null and archived_at is null group by 1 order by 2 desc`
  const prio = await db<{ priority: string | null; n: number }[]>`select priority, count(*)::int n from businesses where merged_into is null and archived_at is null group by 1 order by 1`
  const merges = await db<{ id: string; score: number; reasons: string[]; a_id: string; a_name: string; a_city: string | null; b_id: string; b_name: string; b_city: string | null }[]>`
    select m.id, m.score, m.reasons, a.id a_id, a.name a_name, a.city a_city, b.id b_id, b.name b_name, b.city b_city
    from business_merges m join businesses a on a.id = m.primary_id join businesses b on b.id = m.candidate_id
    where m.status = 'PENDING' and a.merged_into is null and b.merged_into is null order by m.score desc limit 100`
  const toEnrich = await db<{ n: number }[]>`select count(*)::int n from businesses where enriched_at is null and merged_into is null and archived_at is null`
  return (
    <>
      <PageHeader title="Qualification" description="Scoring transparent, vérification de présence web et revue des doublons ambigus." actions={<RescoreButton />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {['A', 'B', 'C', 'D'].map((p) => <Stat key={p} label={`Priorité ${p}`} value={fmtInt(prio.find((x) => x.priority === p)?.n ?? 0)} href={`/prospects?priority=${p}`} hint={{ A: 'score ≥ 75', B: '55–74', C: '35–54', D: '< 35' }[p]} />)}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Distribution des scores" /><CardBody><Bars data={dist} xKey="bucket" series={[{ key: 'n', label: 'Prospects' }]} /></CardBody></Card>
        <Card>
          <CardHeader title="Présence web" description={`${fmtInt(toEnrich[0]?.n)} prospect(s) jamais enrichis`} />
          <ul className="divide-y divide-border text-sm">
            {presence.map((p) => <li key={p.web_presence_status}><Link href={`/prospects?presence=${p.web_presence_status}`} className="flex justify-between px-5 py-2.5 hover:bg-panel-2"><span>{PRESENCE[p.web_presence_status]?.label ?? p.web_presence_status}</span><span className="tabular text-muted">{fmtInt(p.n)}</span></Link></li>)}
          </ul>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title={`Doublons potentiels à vérifier (${merges.length})`} description="Jamais fusionnés automatiquement : ouvrez une fiche pour fusionner ou rejeter." />
        {merges.length ? (
          <Table>
            <thead><tr><Th>Fiche A</Th><Th>Fiche B</Th><Th>Score</Th><Th>Raisons</Th></tr></thead>
            <tbody>
              {merges.map((m) => (
                <tr key={m.id}>
                  <Td><Link href={`/prospects/${m.a_id}`} className="font-medium hover:text-primary">{m.a_name}</Link><div className="text-xs text-muted">{m.a_city}</div></Td>
                  <Td><Link href={`/prospects/${m.b_id}`} className="font-medium hover:text-primary">{m.b_name}</Link><div className="text-xs text-muted">{m.b_city}</div></Td>
                  <Td className="tabular">{Math.round(m.score * 100)} %</Td>
                  <Td className="text-xs text-muted">{m.reasons.join(' · ')}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="Aucun doublon en attente" />}
      </Card>
    </>
  )
}
