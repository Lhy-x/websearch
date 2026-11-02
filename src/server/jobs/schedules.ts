import { CronExpressionParser } from 'cron-parser'
import { sql } from '../core/db'
import { enqueueJob } from './queue'

export function nextRun(cron: string, timezone: string, from = new Date()): Date {
  const it = CronExpressionParser.parse(cron, { currentDate: from, tz: timezone })
  return it.next().toDate()
}

export function validateCron(cron: string, timezone = 'Europe/Paris'): string | null {
  try {
    const it = CronExpressionParser.parse(cron, { tz: timezone })
    const a = it.next().toDate()
    const b = it.next().toDate()
    if (b.getTime() - a.getTime() < 15 * 60_000) return 'Intervalle minimal : 15 minutes (protection contre les boucles).'
    return null
  } catch (e) {
    return `Expression cron invalide: ${(e as Error).message}`
  }
}

/**
 * Enqueue due schedules. The idempotency key (schedule id + planned fire time) guarantees a schedule
 * fires at most once per slot even with several workers or a restart.
 */
export async function fireDueSchedules(now = new Date()): Promise<number> {
  const db = sql()
  const due = await db<{ id: string; job_type: string; payload: object; cron: string; timezone: string; next_run_at: Date | null }[]>`
    select id, job_type, payload, cron, timezone, next_run_at from automation_schedules
    where enabled and (next_run_at is null or next_run_at <= ${now})`
  let fired = 0
  for (const s of due) {
    const slot = s.next_run_at ?? now
    if (s.next_run_at) {
      const { job, created } = await enqueueJob(s.job_type, { ...s.payload, scheduleId: s.id }, {
        idempotencyKey: `schedule:${s.id}:${slot.toISOString()}`,
        scheduleId: s.id,
        priority: 80,
      })
      if (created) fired++
      await db`update automation_schedules set last_run_at = ${now}, last_job_id = ${job.id} where id = ${s.id}`
    }
    await db`update automation_schedules set next_run_at = ${nextRun(s.cron, s.timezone, now)} where id = ${s.id}`
  }
  return fired
}
