import { z } from 'zod'
import { sql } from '@/server/core/db'
import { AppError } from '@/server/core/errors'
import { adminRoute } from '@/server/http/route'
import { nextRun, validateCron } from '@/server/jobs/schedules'
import { searchParamsSchema } from '@/server/search/params'

const schema = z.object({ name: z.string().trim().min(1).max(120), params: searchParamsSchema, cron: z.string().trim().max(100).optional().nullable(), timezone: z.string().default('Europe/Paris') })

export const POST = adminRoute(async ({ body }) => {
  const db = sql()
  if (body.cron) {
    const err = validateCron(body.cron, body.timezone)
    if (err) throw new AppError(err, 400)
  }
  return db.begin(async (tx) => {
    const [s] = await tx<{ id: string }[]>`insert into saved_searches (name, params) values (${body.name}, ${tx.json(body.params as never)}) returning id`
    let scheduleId: string | null = null
    if (body.cron) {
      const [sch] = await tx<{ id: string }[]>`insert into automation_schedules (name, job_type, payload, cron, timezone, next_run_at)
        values (${'Recherche : ' + body.name}, 'search.run', ${tx.json({ savedSearchId: s!.id })}, ${body.cron}, ${body.timezone}, ${nextRun(body.cron, body.timezone)}) returning id`
      scheduleId = sch!.id
    }
    return { id: s!.id, scheduleId }
  })
}, schema)

export const GET = adminRoute(async () => {
  return sql()`select s.id, s.name, s.params, s.created_at,
      (select row_to_json(x) from (select id, cron, enabled, next_run_at from automation_schedules where payload->>'savedSearchId' = s.id::text limit 1) x) schedule,
      (select row_to_json(r) from (select id, status, total_found, new_count, created_at from search_runs where saved_search_id = s.id order by created_at desc limit 1) r) last_run
    from saved_searches s order by s.created_at desc`
})
