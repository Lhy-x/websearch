import Link from 'next/link'
import { Suspense } from 'react'
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProspectTable } from '@/components/prospect-table'
import { sql } from '@/server/core/db'
import { listBusinesses } from '@/server/business/queries'
import { PIPELINE } from '@/lib/labels'
import { fmtDate, fmtEur } from '@/lib/utils'
import { Kanban, TaskToggle } from './kanban'

export const metadata = { title: 'CRM' }
export const dynamic = 'force-dynamic'

const KANBAN = ['QUALIFIED', 'WEBSITE_GENERATED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING_BOOKED', 'NEGOTIATION', 'WON', 'LOST']

export default async function CrmPage() {
  const db = sql()
  const cards = await db<{ id: string; name: string; city: string | null; score: number | null; pipeline_status: string; amount: number | null; next_task: Date | null }[]>`
    select b.id, b.name, b.city, b.score, b.pipeline_status,
      (select sum(amount_cents)::int from crm_opportunities o where o.business_id = b.id and o.status <> 'LOST') amount,
      (select min(due_at) from crm_tasks t where t.business_id = b.id and t.done_at is null) next_task
    from businesses b where b.merged_into is null and b.archived_at is null and b.pipeline_status = any(${KANBAN})
    order by b.updated_at desc limit 600`
  const tasks = await db<{ id: string; business_id: string | null; name: string | null; title: string; due_at: Date | null; source: string }[]>`
    select t.id, t.business_id, b.name, t.title, t.due_at, t.source from crm_tasks t left join businesses b on b.id = t.business_id where t.done_at is null order by t.due_at nulls last limit 200`
  const opps = await db<{ id: string; business_id: string; name: string; title: string; amount_cents: number | null; status: string; signed_at: Date | null; paid_cents: number | null }[]>`
    select o.id, o.business_id, b.name, o.title, o.amount_cents, o.status, o.signed_at, o.paid_cents from crm_opportunities o join businesses b on b.id = o.business_id order by o.updated_at desc limit 200`
  const { rows } = await listBusinesses({ pipeline: KANBAN.join(','), websiteFilter: 'any', archived: 'false', sort: 'score', dir: 'desc', page: 1, pageSize: 200 })
  type Task = (typeof tasks)[number]
  const days = new Map<string, Task[]>()
  for (const t of tasks) {
    const k = t.due_at ? t.due_at.toISOString().slice(0, 10) : 'Sans échéance'
    days.set(k, [...(days.get(k) ?? []), t])
  }
  return (
    <>
      <PageHeader title="CRM" description="Pipeline commercial, tâches et opportunités." />
      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="table">Tableau</TabsTrigger>
          <TabsTrigger value="calendar">Rappels ({tasks.length})</TabsTrigger>
          <TabsTrigger value="opps">Opportunités ({opps.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="kanban">
          <Suspense><Kanban columns={KANBAN.map((k) => PIPELINE.find((p) => p.id === k)!)} cards={cards.map((c) => ({ ...c, next_task: c.next_task?.toISOString() ?? null }))} /></Suspense>
        </TabsContent>
        <TabsContent value="table"><Card>{rows.length ? <ProspectTable rows={rows} /> : <EmptyState title="Pipeline vide" />}</Card></TabsContent>
        <TabsContent value="calendar">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...days.entries()].map(([day, ts]) => (
              <Card key={day}>
                <CardHeader title={day === 'Sans échéance' ? day : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date(day))} description={day !== 'Sans échéance' && new Date(day) < new Date(new Date().toISOString().slice(0, 10)) ? 'En retard' : undefined} />
                <ul className="divide-y divide-border text-sm">
                  {ts.map((t) => <li key={t.id} className="flex items-start gap-2 px-5 py-2.5"><TaskToggle businessId={t.business_id} taskId={t.id} /><span><span className="block">{t.title}</span>{t.business_id ? <Link className="text-xs text-primary" href={`/prospects/${t.business_id}`}>{t.name}</Link> : null}{t.due_at ? <span className="text-xs text-muted"> · {fmtDate(t.due_at)}</span> : null}</span></li>)}
                </ul>
              </Card>
            ))}
            {!tasks.length ? <Card><EmptyState title="Aucune tâche ouverte" /></Card> : null}
          </div>
        </TabsContent>
        <TabsContent value="opps">
          <Card>
            <ul className="divide-y divide-border text-sm">
              {opps.map((o) => <li key={o.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5"><span><Link href={`/prospects/${o.business_id}`} className="font-medium hover:text-primary">{o.name}</Link> — {o.title}</span><span className="text-xs text-muted">{o.status} · {fmtEur(o.amount_cents)}{o.signed_at ? ` · signé ${fmtDate(o.signed_at, false)}` : ''}{o.paid_cents ? ` · encaissé ${fmtEur(o.paid_cents)}` : ''}</span></li>)}
              {!opps.length ? <EmptyState title="Aucune opportunité" description="Créez-en depuis une fiche prospect." /> : null}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
