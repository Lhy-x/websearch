import { sql } from '@/server/core/db'
import { adminRoute } from '@/server/http/route'
import { enqueueJob } from '@/server/jobs/queue'
import { searchParamsSchema } from '@/server/search/params'

/** Start a search: persisted run + job executed by the worker (never inside the HTTP request). */
export const POST = adminRoute(async ({ body }) => {
  const params = searchParamsSchema.parse(body)
  const db = sql()
  const [run] = await db<{ id: string }[]>`insert into search_runs (params) values (${db.json(params as never)}) returning id`
  const { job } = await enqueueJob('search.run', { runId: run!.id, params }, { priority: 50, maxAttempts: 2 })
  await db`update search_runs set job_id = ${job.id} where id = ${run!.id}`
  return { runId: run!.id, jobId: job.id }
}, searchParamsSchema)

export const GET = adminRoute(async () => {
  return sql()`select r.id, r.params, r.status, r.total_found, r.new_count, r.merge_pending_count, r.created_at, r.finished_at, r.error, s.name saved_name
    from search_runs r left join saved_searches s on s.id = r.saved_search_id order by r.created_at desc limit 30`
})
