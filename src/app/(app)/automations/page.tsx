import Link from 'next/link'
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/primitives'
import { sql } from '@/server/core/db'
import { getFlags } from '@/server/core/settings'
import { JOB_TYPES } from '@/server/jobs/handlers'
import { JOB_STATUS } from '@/lib/labels'
import { fmtDate, fmtRelative } from '@/lib/utils'
import { FlagsPanel, ScheduleForm, ScheduleRow, JobFilters, QuickActions } from './controls'

export const metadata = { title: 'Automatisations' }
export const dynamic = 'force-dynamic'

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; page?: string }> }) {
  const sp = await searchParams
  const db = sql()
  const page = Math.max(1, Number(sp.page ?? 1))
  const flags = await getFlags()
  const workers = await db<{ worker_id: string; hostname: string | null; pid: number | null; started_at: Date; last_seen_at: Date; info: { running?: number; concurrency?: number } }[]>`select * from worker_heartbeats order by last_seen_at desc`
  const schedules = await db<{ id: string; name: string; job_type: string; cron: string; timezone: string; enabled: boolean; last_run_at: Date | null; next_run_at: Date | null; last_job_id: string | null }[]>`select id, name, job_type, cron, timezone, enabled, last_run_at, next_run_at, last_job_id from automation_schedules order by created_at`
  const counts = await db<{ status: string; n: number }[]>`select status, count(*)::int n from automation_jobs group by 1`
  const where = [sp.status ? db`status = ${sp.status}` : db`true`, sp.type ? db`type = ${sp.type}` : db`true`].reduce((a, b) => db`${a} and ${b}`)
  const jobs = await db<{ id: string; type: string; status: string; priority: number; attempts: number; max_attempts: number; progress: number; progress_message: string | null; error: string | null; created_at: Date; started_at: Date | null; finished_at: Date | null; run_at: Date }[]>`
    select id, type, status, priority, attempts, max_attempts, progress, progress_message, error, created_at, started_at, finished_at, run_at from automation_jobs where ${where} order by created_at desc limit 50 offset ${(page - 1) * 50}`
  const campaigns = await db<{ id: string; name: string }[]>`select id, name from campaigns where mode = 'AUTO' and status <> 'STOPPED'`
  const saved = await db<{ id: string; name: string }[]>`select id, name from saved_searches`
  const online = workers.filter((w) => Date.now() - w.last_seen_at.getTime() < 60_000)
  return (
    <>
      <PageHeader title="Automatisations" description="Moteur de tâches persistant (PostgreSQL) : reprise sur panne, retries avec backoff, idempotence, journalisation." actions={<QuickActions />} />
      <div className="grid gap-6 xl:grid-cols-3">
        <FlagsPanel flags={flags} />
        <Card>
          <CardHeader title={`Workers (${online.length} actif${online.length > 1 ? 's' : ''})`} description="Lancez un worker avec npm run worker" />
          <ul className="divide-y divide-border text-xs">
            {workers.map((w) => (
              <li key={w.worker_id} className="flex items-center justify-between px-5 py-2.5">
                <span className="font-mono">{w.worker_id}</span>
                <Badge tone={Date.now() - w.last_seen_at.getTime() < 60_000 ? 'success' : 'danger'}>{Date.now() - w.last_seen_at.getTime() < 60_000 ? `actif · ${w.info.running ?? 0} en cours` : `muet ${fmtRelative(w.last_seen_at)}`}</Badge>
              </li>
            ))}
            {!workers.length ? <li className="px-5 py-3 text-warning">Aucun worker n’a jamais démarré : les recherches, générations et envois restent en attente.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Tâches" />
          <div className="grid grid-cols-3 gap-2 p-5 text-center text-xs">
            {['PENDING', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED'].map((s) => (
              <Link key={s} href={`/automations?status=${s}`} className="rounded-lg border border-border p-2 hover:border-primary/40"><p className="tabular text-lg font-semibold">{counts.find((c) => c.status === s)?.n ?? 0}</p><p className="text-muted">{s}</p></Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Planifications" description="Expressions cron (intervalle ≥ 15 min). Chaque créneau ne déclenche qu’une tâche, même avec plusieurs workers." />
        <Table>
          <thead><tr><Th>Nom</Th><Th>Tâche</Th><Th>Cron</Th><Th>Dernière</Th><Th>Prochaine</Th><Th /></tr></thead>
          <tbody>
            {schedules.map((s) => <ScheduleRow key={s.id} s={{ ...s, label: JOB_TYPES[s.job_type as keyof typeof JOB_TYPES] ?? s.job_type, last_run_at: s.last_run_at?.toISOString() ?? null, next_run_at: s.next_run_at?.toISOString() ?? null }} />)}
          </tbody>
        </Table>
        <ScheduleForm campaigns={campaigns} saved={saved} />
      </Card>

      <Card className="mt-6">
        <CardHeader title="Journal des tâches" actions={<JobFilters types={Object.entries(JOB_TYPES)} />} />
        {jobs.length ? (
          <Table>
            <thead><tr><Th>Type</Th><Th>Statut</Th><Th>Tentatives</Th><Th>Progression</Th><Th>Créée</Th><Th>Durée</Th><Th>Erreur</Th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-panel-2/60">
                  <Td><Link href={`/automations/${j.id}`} className="font-medium hover:text-primary">{JOB_TYPES[j.type as keyof typeof JOB_TYPES] ?? j.type}</Link><div className="font-mono text-[10px] text-muted">{j.id.slice(0, 8)}</div></Td>
                  <Td><Badge tone={JOB_STATUS[j.status]}>{j.status}</Badge>{j.status === 'RETRYING' ? <div className="text-[11px] text-muted">reprise {fmtRelative(j.run_at)}</div> : null}</Td>
                  <Td className="tabular text-xs">{j.attempts}/{j.max_attempts}</Td>
                  <Td className="text-xs">{j.status === 'RUNNING' ? `${Math.round(j.progress * 100)} % ${j.progress_message ?? ''}` : '—'}</Td>
                  <Td className="text-xs text-muted">{fmtDate(j.created_at)}</Td>
                  <Td className="tabular text-xs text-muted">{j.started_at && j.finished_at ? `${((j.finished_at.getTime() - j.started_at.getTime()) / 1000).toFixed(1)} s` : '—'}</Td>
                  <Td className="max-w-xs truncate text-xs text-danger">{j.error}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="Aucune tâche" />}
        <div className="flex justify-between px-5 py-3 text-xs">
          {page > 1 ? <Link className="text-primary" href={`/automations?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.type ? { type: sp.type } : {}), page: String(page - 1) })}`}>← Précédent</Link> : <span />}
          {jobs.length === 50 ? <Link className="text-primary" href={`/automations?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.type ? { type: sp.type } : {}), page: String(page + 1) })}`}>Suivant →</Link> : null}
        </div>
      </Card>
    </>
  )
}
