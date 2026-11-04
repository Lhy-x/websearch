import { hostname } from 'node:os'
import { randomBytes } from 'node:crypto'
import { sql } from '../core/db'
import { errorMessage } from '../core/errors'
import { getRuntimeConfig, getFlags, getSettings } from '../core/settings'
import { claimJob, completeJob, failJob, heartbeat, isJobActive, jobLog, recoverStaleJobs, enqueueJob, type Job } from './queue'
import { fireDueSchedules } from './schedules'
import { HANDLERS, type JobType } from './handlers'
import { env } from '../core/env'

export interface RunnerOptions {
  concurrency?: number
  pollMs?: number
  types?: string[]
  /** for tests: stop after the queue is empty */
  drain?: boolean
}

/** Execute one claimed job with heartbeats, logging and retry semantics. */
export async function executeJob(job: Job, workerId: string): Promise<'COMPLETED' | 'FAILED' | 'RETRYING'> {
  const handler = HANDLERS[job.type as JobType]
  if (!handler) {
    await failJob({ ...job, max_attempts: 0 }, new Error(`Type de tâche inconnu : ${job.type}`))
    return 'FAILED'
  }
  const hb = setInterval(() => void heartbeat(job.id).catch(() => undefined), 20_000)
  try {
    await jobLog(job.id, 'info', `Démarrage (tentative ${job.attempts}/${job.max_attempts}) par ${workerId}`)
    const result = await handler(job.payload, {
      job,
      log: async (message, progress) => {
        await jobLog(job.id, message.startsWith('⚠') ? 'warn' : 'info', message)
        await heartbeat(job.id, progress, message)
      },
      isActive: () => isJobActive(job.id),
    })
    await completeJob(job.id, result)
    await jobLog(job.id, 'info', 'Terminé')
    return 'COMPLETED'
  } catch (e) {
    const state = await failJob(job, e).catch(() => 'FAILED' as const)
    await jobLog(job.id, 'error', `${state === 'RETRYING' ? 'Échec temporaire, nouvelle tentative planifiée' : 'Échec définitif'} : ${errorMessage(e)}`)
    return state
  } finally {
    clearInterval(hb)
  }
}

export class Worker {
  readonly id = `${hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`
  private running = new Set<Promise<unknown>>()
  private stopping = false
  private timers: NodeJS.Timeout[] = []
  private configuredConcurrency=env().WORKER_CONCURRENCY

  constructor(private opts: RunnerOptions = {}) {}

  async start() {
    const db = sql()
    this.configuredConcurrency=(await getRuntimeConfig()).WORKER_CONCURRENCY
    await db`insert into worker_heartbeats (worker_id, hostname, pid, info) values (${this.id}, ${hostname()}, ${process.pid}, ${db.json({ concurrency: this.concurrency() })})
             on conflict (worker_id) do update set last_seen_at = now()`
    const every = (ms: number, fn: () => Promise<unknown>) => {
      const run = () => fn().catch((e) => console.error(`[worker] ${errorMessage(e)}`))
      void run()
      this.timers.push(setInterval(run, ms))
    }
    every(15_000, () => db`insert into worker_heartbeats (worker_id, hostname, pid, info) values (${this.id}, ${hostname()}, ${process.pid}, ${db.json({ concurrency: this.concurrency(), running: this.running.size })})
             on conflict (worker_id) do update set last_seen_at = now(), info = excluded.info`)
    every(30_000, async () => {
      if ((await getFlags()).globalPause) return
      await fireDueSchedules()
      const recovered = await recoverStaleJobs()
      if (recovered) await jobLog(null, 'warn', `${recovered} tâche(s) reprise(s) après interruption d’un worker`)
    })
    every(60_000, async () => {
      if ((await getFlags()).globalPause) return
      const minute = new Date().toISOString().slice(0, 16)
      await enqueueJob('campaign.tick', {}, { priority: 10, idempotencyKey: `campaign.tick:${minute}`, maxAttempts: 1 })
      if ((await getRuntimeConfig()).IMAP_HOST && Number(minute.slice(-2)) % 5 === 0) await enqueueJob('inbox.sync', {}, { priority: 20, idempotencyKey: `inbox.sync:${minute}`, maxAttempts: 2 })
      if(Number(minute.slice(-2))%5===0)await enqueueJob('hosting.sweep',{}, {priority:80,idempotencyKey:`hosting.sweep:${minute}`,maxAttempts:2})
      if (minute.endsWith('03:17')) await enqueueJob('maintenance.cleanup', {}, { idempotencyKey: `cleanup:${minute.slice(0, 10)}` })
    })
    console.log(`[worker] ${this.id} démarré (concurrence ${this.concurrency()})`)
    await this.loop()
  }

  private concurrency() {
    return this.opts.concurrency ?? this.configuredConcurrency
  }

  private async loop() {
    while (!this.stopping) {
      const flags = await getFlags().catch(() => ({ globalPause: false, emergencyStop: false }))
      const settings=await getSettings().catch(()=>null)
      if(settings)this.configuredConcurrency=(await getRuntimeConfig(settings)).WORKER_CONCURRENCY
      const limit = Math.min(this.concurrency(),settings?.automation.maxConcurrentJobs??this.concurrency())
      if (flags.globalPause || this.running.size >= limit) {
        await sleep(this.opts.pollMs ?? 1000)
        continue
      }
      const job = await claimJob(this.id, this.opts.types).catch((e) => {
        console.error(`[worker] claim: ${errorMessage(e)}`)
        return null
      })
      if (!job) {
        if (this.opts.drain && this.running.size === 0) break
        await sleep(this.opts.pollMs ?? 1000)
        continue
      }
      const p = executeJob(job, this.id)
        .catch((e) => console.error(`[worker] tâche ${job.id} : ${errorMessage(e)}`))
        .finally(() => this.running.delete(p))
      this.running.add(p)
    }
    await Promise.all(this.running)
  }

  async stop(timeoutMs = 30_000) {
    this.stopping = true
    this.timers.forEach(clearInterval)
    await Promise.race([Promise.all(this.running), sleep(timeoutMs)])
    await sql()`delete from worker_heartbeats where worker_id = ${this.id}`.catch(() => undefined)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
