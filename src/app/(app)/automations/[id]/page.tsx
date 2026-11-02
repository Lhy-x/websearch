import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Card, CardBody, CardHeader, Notice } from '@/components/ui/primitives'
import { sql } from '@/server/core/db'
import { JOB_TYPES } from '@/server/jobs/handlers'
import { JOB_STATUS } from '@/lib/labels'
import { fmtDate } from '@/lib/utils'
import { JobButtons } from '../controls'

export const dynamic = 'force-dynamic'

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [job] = await sql()<{ id: string; type: string; status: string; payload: unknown; result: unknown; error: string | null; attempts: number; max_attempts: number; idempotency_key: string | null; locked_by: string | null; created_at: Date; started_at: Date | null; finished_at: Date | null; run_at: Date; progress: number; progress_message: string | null }[]>`select * from automation_jobs where id = ${id}`
  if (!job) notFound()
  const logs = await sql()<{ id: number; level: string; message: string; data: unknown; created_at: Date }[]>`select id, level, message, data, created_at from job_logs where job_id = ${id} order by id`
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted"><Link href="/automations" className="hover:text-fg">Automatisations</Link></p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">{JOB_TYPES[job.type as keyof typeof JOB_TYPES] ?? job.type} <Badge tone={JOB_STATUS[job.status]}>{job.status}</Badge></h1>
          <p className="mt-1 font-mono text-xs text-muted">{job.id} · tentatives {job.attempts}/{job.max_attempts}{job.idempotency_key ? ` · clé ${job.idempotency_key}` : ''}{job.locked_by ? ` · ${job.locked_by}` : ''}</p>
          <p className="text-xs text-muted">Créée {fmtDate(job.created_at)} · démarrée {fmtDate(job.started_at)} · terminée {fmtDate(job.finished_at)}</p>
        </div>
        <JobButtons id={job.id} status={job.status} />
      </div>
      {job.error ? <div className="mb-4"><Notice tone="danger" title="Erreur">{job.error}</Notice></div> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Paramètres" /><CardBody><pre className="overflow-x-auto text-xs">{JSON.stringify(job.payload, null, 2)}</pre></CardBody></Card>
        <Card><CardHeader title="Résultat" /><CardBody><pre className="max-h-96 overflow-auto text-xs">{JSON.stringify(job.result, null, 2) ?? '—'}</pre></CardBody></Card>
      </div>
      <Card className="mt-6">
        <CardHeader title={`Journal (${logs.length})`} />
        <ul className="divide-y divide-border font-mono text-xs">
          {logs.map((l) => <li key={l.id} className={`px-5 py-1.5 ${l.level === 'error' ? 'text-danger' : l.level === 'warn' ? 'text-warning' : ''}`}>{new Date(l.created_at).toLocaleString('fr-FR')} [{l.level}] {l.message}</li>)}
        </ul>
      </Card>
    </>
  )
}
