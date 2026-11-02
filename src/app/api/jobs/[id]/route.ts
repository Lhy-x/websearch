import { sql } from '@/server/core/db'
import { AppError } from '@/server/core/errors'
import { adminRoute } from '@/server/http/route'
import { cancelJob, retryJob } from '@/server/jobs/queue'

export const GET = adminRoute(async ({ params }) => {
  const [job] = await sql()`select * from automation_jobs where id = ${params.id}`
  if (!job) throw new AppError('Tâche introuvable', 404)
  const logs = await sql()`select level, message, data, created_at from job_logs where job_id = ${params.id} order by id`
  return { job, logs }
})

export const POST = adminRoute(async ({ params, req }) => {
  const action = new URL(req.url).searchParams.get('action')
  if (action === 'cancel') return { ok: await cancelJob(params.id) }
  if (action === 'retry') return { ok: await retryJob(params.id) }
  throw new AppError('Action inconnue', 400)
})
