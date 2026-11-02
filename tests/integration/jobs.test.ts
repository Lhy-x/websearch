import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql, closeDb } from '@/server/core/db'
import { TransientError } from '@/server/core/errors'
import { claimJob, enqueueJob, failJob, recoverStaleJobs, completeJob } from '@/server/jobs/queue'
import { fireDueSchedules } from '@/server/jobs/schedules'
import { executeJob } from '@/server/jobs/runner'
import { resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

describe('persistent job queue', () => {
  it('idempotency key prevents duplicates', async () => {
    const a = await enqueueJob('maintenance.cleanup', {}, { idempotencyKey: 'k1' })
    const b = await enqueueJob('maintenance.cleanup', {}, { idempotencyKey: 'k1' })
    expect(a.created).toBe(true)
    expect(b.created).toBe(false)
    expect(b.job.id).toBe(a.job.id)
  })
  it('concurrent claims never return the same job', async () => {
    for (let i = 0; i < 10; i++) await enqueueJob('maintenance.cleanup', { i })
    const claims = await Promise.all(Array.from({ length: 15 }, (_, i) => claimJob(`w${i}`)))
    const ids = claims.filter(Boolean).map((j) => j!.id)
    expect(ids).toHaveLength(10)
    expect(new Set(ids).size).toBe(10)
  })
  it('respects priority order', async () => {
    await enqueueJob('maintenance.cleanup', { n: 'low' }, { priority: 200 })
    await enqueueJob('maintenance.cleanup', { n: 'high' }, { priority: 1 })
    expect((await claimJob('w'))!.payload).toEqual({ n: 'high' })
  })
  it('retries transient errors with backoff, then fails permanently', async () => {
    const { job } = await enqueueJob('maintenance.cleanup', {}, { maxAttempts: 2 })
    let j = (await claimJob('w'))!
    expect(await failJob(j, new TransientError('timeout'))).toBe('RETRYING')
    const [r] = await sql()<{ status: string; run_at: Date }[]>`select status, run_at from automation_jobs where id = ${job.id}`
    expect(r!.status).toBe('RETRYING')
    expect(r!.run_at.getTime()).toBeGreaterThan(Date.now() + 10_000)
    await sql()`update automation_jobs set run_at = now() where id = ${job.id}`
    j = (await claimJob('w'))!
    expect(j.attempts).toBe(2)
    expect(await failJob(j, new TransientError('timeout'))).toBe('FAILED')
  })
  it('permanent errors fail immediately', async () => {
    await enqueueJob('maintenance.cleanup', {}, { maxAttempts: 5 })
    const j = (await claimJob('w'))!
    expect(await failJob(j, new Error('validation'))).toBe('FAILED')
  })
  it('recovers jobs of a crashed worker (lost heartbeat)', async () => {
    const { job } = await enqueueJob('maintenance.cleanup', {})
    await claimJob('dead-worker')
    await sql()`update automation_jobs set heartbeat_at = now() - interval '10 minutes' where id = ${job.id}`
    expect(await recoverStaleJobs()).toBe(1)
    const again = await claimJob('w2')
    expect(again!.id).toBe(job.id)
    await completeJob(again!.id, { ok: true })
    const [r] = await sql()<{ status: string }[]>`select status from automation_jobs where id = ${job.id}`
    expect(r!.status).toBe('COMPLETED')
  })
  it('executes a real handler end-to-end and logs it', async () => {
    const { job } = await enqueueJob('maintenance.cleanup', {})
    const claimed = (await claimJob('w'))!
    expect(await executeJob(claimed, 'w')).toBe('COMPLETED')
    const logs = await sql()`select message from job_logs where job_id = ${job.id}`
    expect(logs.length).toBeGreaterThanOrEqual(2)
  })
  it('unknown job types fail instead of disappearing', async () => {
    await enqueueJob('does.not.exist', {})
    const j = (await claimJob('w'))!
    expect(await executeJob(j, 'w')).toBe('FAILED')
  })
  it('a schedule fires exactly once per slot', async () => {
    const past = new Date(Date.now() - 60_000)
    await sql()`insert into automation_schedules (name, job_type, cron, next_run_at) values ('t', 'maintenance.cleanup', '0 7 * * *', ${past})`
    expect(await fireDueSchedules()).toBe(1)
    expect(await fireDueSchedules()).toBe(0)
    await sql()`update automation_schedules set next_run_at = ${past}`
    expect(await fireDueSchedules()).toBe(0) // same slot → idempotency key
    const [{ n }] = (await sql()<{ n: number }[]>`select count(*)::int n from automation_jobs`) as unknown as [{ n: number }]
    expect(n).toBe(1)
  })
})

describe('worker robustness', () => {
  it('a job deleted while running does not throw (logs and state updates are best-effort)', async () => {
    const { job } = await enqueueJob('maintenance.cleanup', {})
    const claimed = (await claimJob('w'))!
    await sql()`delete from automation_jobs where id = ${job.id}`
    await expect(executeJob(claimed, 'w')).resolves.toBeDefined()
  })
})
