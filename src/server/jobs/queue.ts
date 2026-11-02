import { sql } from '../core/db'
import { errorMessage, TransientError } from '../core/errors'

export const JOB_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export interface Job<P = Record<string, unknown>> {
  id: string
  type: string
  payload: P
  status: JobStatus
  priority: number
  attempts: number
  max_attempts: number
  idempotency_key: string | null
  schedule_id: string | null
  run_at: Date
  progress: number
  progress_message: string | null
  result: unknown
  error: string | null
  locked_by: string | null
  created_at: Date
  started_at: Date | null
  finished_at: Date | null
}

export interface EnqueueOptions {
  priority?: number
  runAt?: Date
  maxAttempts?: number
  idempotencyKey?: string
  scheduleId?: string
}

/**
 * Enqueue a job. With an idempotency key, enqueueing twice returns the existing job
 * (whatever its state) instead of creating a duplicate.
 */
export async function enqueueJob<P extends object>(type: string, payload: P, opts: EnqueueOptions = {}): Promise<{ job: Job<P>; created: boolean }> {
  const db = sql()
  const rows = await db<Job<P>[]>`
    insert into automation_jobs (type, payload, priority, run_at, max_attempts, idempotency_key, schedule_id)
    values (${type}, ${db.json(payload as never)}, ${opts.priority ?? 100}, ${opts.runAt ?? new Date()},
            ${opts.maxAttempts ?? 3}, ${opts.idempotencyKey ?? null}, ${opts.scheduleId ?? null})
    on conflict (idempotency_key) do nothing
    returning *`
  if (rows[0]) return { job: rows[0], created: true }
  const [existing] = await db<Job<P>[]>`select * from automation_jobs where idempotency_key = ${opts.idempotencyKey!}`
  return { job: existing!, created: false }
}

/** Atomically claim the next runnable job (lowest priority value, oldest run_at). */
export async function claimJob(workerId: string, types?: string[]): Promise<Job | null> {
  const db = sql()
  const rows = await db<Job[]>`
    update automation_jobs set status = 'RUNNING', locked_by = ${workerId}, locked_at = now(), heartbeat_at = now(),
           started_at = coalesce(started_at, now()), attempts = attempts + 1, error = null
    where id = (
      select id from automation_jobs
      where status in ('PENDING','RETRYING') and run_at <= now()
        ${types && types.length ? db`and type in ${db(types)}` : db``}
      order by priority asc, run_at asc
      for update skip locked
      limit 1
    )
    returning *`
  return rows[0] ?? null
}

export async function heartbeat(jobId: string, progress?: number, message?: string) {
  await sql()`
    update automation_jobs set heartbeat_at = now(),
      progress = coalesce(${progress ?? null}::real, progress),
      progress_message = coalesce(${message ?? null}, progress_message)
    where id = ${jobId} and status = 'RUNNING'`
}

export async function completeJob(jobId: string, result: unknown) {
  await sql()`
    update automation_jobs set status = 'COMPLETED', result = ${sql().json((result ?? null) as never)}, progress = 1,
      finished_at = now(), locked_by = null, locked_at = null
    where id = ${jobId} and status = 'RUNNING'`
}

/** Exponential backoff with jitter: 30s, 2m, 8m, 32m… capped at 6h. */
export function backoffMs(attempt: number, base = 30_000): number {
  const raw = Math.min(base * 4 ** Math.max(0, attempt - 1), 6 * 3600_000)
  return Math.round(raw * (0.85 + Math.random() * 0.3))
}

/**
 * Mark a job failed. Transient errors are retried (RETRYING + run_at in the future) until max_attempts.
 * Permanent errors (validation, configuration…) fail immediately.
 */
export async function failJob(job: Pick<Job, 'id' | 'attempts' | 'max_attempts'>, err: unknown): Promise<'RETRYING' | 'FAILED'> {
  const message = errorMessage(err).slice(0, 4000)
  const transient = err instanceof TransientError || isNetworkError(err)
  if (transient && job.attempts < job.max_attempts) {
    const delay = err instanceof TransientError && err.retryAfterMs ? err.retryAfterMs : backoffMs(job.attempts)
    await sql()`
      update automation_jobs set status = 'RETRYING', error = ${message}, run_at = now() + ${delay + ' milliseconds'}::interval,
        locked_by = null, locked_at = null
      where id = ${job.id}`
    return 'RETRYING'
  }
  await sql()`
    update automation_jobs set status = 'FAILED', error = ${message}, finished_at = now(), locked_by = null, locked_at = null
    where id = ${job.id}`
  return 'FAILED'
}

function isNetworkError(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code
  return !!code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ENOTFOUND'].includes(code)
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const rows = await sql()`
    update automation_jobs set status = 'CANCELLED', finished_at = now(), locked_by = null
    where id = ${jobId} and status in ('PENDING','RETRYING','RUNNING') returning id`
  return rows.length > 0
}

export async function retryJob(jobId: string): Promise<boolean> {
  const rows = await sql()`
    update automation_jobs set status = 'PENDING', run_at = now(), error = null, finished_at = null,
      max_attempts = greatest(max_attempts, attempts + 1)
    where id = ${jobId} and status in ('FAILED','CANCELLED') returning id`
  return rows.length > 0
}

/** Is the job still RUNNING (not cancelled by the admin)? Long handlers check this between steps. */
export async function isJobActive(jobId: string): Promise<boolean> {
  const [row] = await sql()<{ status: string }[]>`select status from automation_jobs where id = ${jobId}`
  return row?.status === 'RUNNING'
}

/**
 * Crash recovery: jobs whose worker stopped heart-beating are put back in the queue
 * (or failed if they exhausted their attempts).
 */
export async function recoverStaleJobs(staleAfterMs = 5 * 60_000): Promise<number> {
  const rows = await sql()`
    update automation_jobs set
      status = case when attempts >= max_attempts then 'FAILED' else 'RETRYING' end,
      error = 'Worker interrompu (heartbeat perdu) — reprise automatique',
      finished_at = case when attempts >= max_attempts then now() else null end,
      run_at = now(), locked_by = null, locked_at = null
    where status = 'RUNNING' and heartbeat_at < now() - ${staleAfterMs + ' milliseconds'}::interval
    returning id`
  return rows.length
}

export async function jobLog(jobId: string | null, level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) {
  await sql()`insert into job_logs (job_id, level, message, data) values (${jobId}, ${level}, ${message.slice(0, 2000)}, ${data === undefined ? null : sql().json(data as never)})`
}
