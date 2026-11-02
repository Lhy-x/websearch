import { sql } from '@/server/core/db'
import { AppError } from '@/server/core/errors'
import { adminRoute } from '@/server/http/route'

export const GET = adminRoute(async ({ params }) => {
  const db = sql()
  const [run] = await db`select r.*, j.status job_status, j.progress, j.progress_message, j.error job_error, j.attempts
    from search_runs r left join automation_jobs j on j.id = r.job_id where r.id = ${params.id}`
  if (!run) throw new AppError('Recherche introuvable', 404)
  const logs = run.job_id ? await db`select level, message, created_at from job_logs where job_id = ${run.job_id} order by id desc limit 15` : []
  const [worker] = await db<{ n: number }[]>`select count(*)::int n from worker_heartbeats where last_seen_at > now() - interval '1 minute'`
  return { run, logs: logs.reverse(), workersOnline: worker?.n ?? 0 }
})
