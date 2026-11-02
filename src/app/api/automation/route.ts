import { z } from 'zod'
import { sql } from '@/server/core/db'
import { AppError } from '@/server/core/errors'
import { auditLog } from '@/server/core/audit'
import { setFlags } from '@/server/core/settings'
import { adminRoute } from '@/server/http/route'
import { enqueueJob } from '@/server/jobs/queue'
import { nextRun, validateCron } from '@/server/jobs/schedules'

const SCHEDULABLE = ['search.run', 'campaign.autofill', 'inbox.sync', 'maintenance.cleanup', 'backup.run', 'business.enrich'] as const

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('flags'), globalPause: z.boolean().optional(), emergencyStop: z.boolean().optional() }),
  z.object({ action: z.literal('schedule_create'), name: z.string().trim().min(1).max(120), jobType: z.enum(SCHEDULABLE), payload: z.record(z.string(), z.unknown()).default({}), cron: z.string().max(100), timezone: z.string().default('Europe/Paris') }),
  z.object({ action: z.literal('schedule_toggle'), id: z.string().uuid(), enabled: z.boolean() }),
  z.object({ action: z.literal('schedule_delete'), id: z.string().uuid() }),
  z.object({ action: z.literal('enqueue'), jobType: z.enum(['maintenance.cleanup', 'backup.run', 'inbox.sync', 'campaign.tick']) }),
  z.object({ action: z.literal('retry_failed') }),
])

export const POST = adminRoute(async ({ body, admin }) => {
  const db = sql()
  switch (body.action) {
    case 'flags':
      await setFlags(body)
      await auditLog({ action: 'automation.flags', actor: admin.email, level: 'warn', data: body })
      return { ok: true }
    case 'schedule_create': {
      const err = validateCron(body.cron, body.timezone)
      if (err) throw new AppError(err, 400)
      const [s] = await db<{ id: string }[]>`insert into automation_schedules (name, job_type, payload, cron, timezone, next_run_at)
        values (${body.name}, ${body.jobType}, ${db.json(body.payload as never)}, ${body.cron}, ${body.timezone}, ${nextRun(body.cron, body.timezone)}) returning id`
      return { id: s!.id }
    }
    case 'schedule_toggle':
      await db`update automation_schedules set enabled = ${body.enabled}, next_run_at = case when ${body.enabled} then null else next_run_at end where id = ${body.id}`
      if (body.enabled) {
        const [s] = await db<{ cron: string; timezone: string }[]>`select cron, timezone from automation_schedules where id = ${body.id}`
        if (s) await db`update automation_schedules set next_run_at = ${nextRun(s.cron, s.timezone)} where id = ${body.id}`
      }
      return { ok: true }
    case 'schedule_delete':
      await db`delete from automation_schedules where id = ${body.id}`
      return { ok: true }
    case 'enqueue':
      return { jobId: (await enqueueJob(body.jobType, {}, { priority: 20 })).job.id }
    case 'retry_failed': {
      const r = await db`update automation_jobs set status = 'PENDING', run_at = now(), error = null, finished_at = null, max_attempts = greatest(max_attempts, attempts + 1)
        where status = 'FAILED' and finished_at > now() - interval '7 days' returning id`
      return { retried: r.length }
    }
  }
}, schema)
