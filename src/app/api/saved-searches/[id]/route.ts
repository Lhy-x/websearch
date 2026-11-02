import { sql } from '@/server/core/db'
import { adminRoute } from '@/server/http/route'

export const DELETE = adminRoute(async ({ params }) => {
  await sql()`delete from automation_schedules where payload->>'savedSearchId' = ${params.id}`
  await sql()`delete from saved_searches where id = ${params.id}`
  return { ok: true }
})
