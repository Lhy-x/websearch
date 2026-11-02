import { z } from 'zod'
import { sql } from '@/server/core/db'
import { adminRoute } from '@/server/http/route'

/** Tasks not attached to a prospect. */
export const POST = adminRoute(async ({ body }) => {
  await sql()`update crm_tasks set done_at = now() where id = ${body.taskId}`
  return { ok: true }
}, z.object({ taskId: z.string().uuid() }))
