import { statfs, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { sql } from './core/db'
import { env } from './core/env'
import { storageRoot } from './core/storage'
import { CONNECTORS } from './connectors'
import { aiAvailability } from './ai/client'

async function dirSize(dir: string, depth = 0): Promise<number> {
  if (depth > 6) return 0
  let total = 0
  try {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      total += e.isDirectory() ? await dirSize(p, depth + 1) : (await stat(p)).size
    }
  } catch {
    /* missing dir */
  }
  return total
}

export async function infraStatus() {
  const db = sql()
  let postgres: { ok: boolean; version?: string; size?: string; error?: string }
  try {
    const [r] = await db<{ v: string; size: string }[]>`select version() v, pg_size_pretty(pg_database_size(current_database())) size`
    postgres = { ok: true, version: r!.v.split(' ').slice(0, 2).join(' '), size: r!.size }
  } catch (e) {
    postgres = { ok: false, error: (e as Error).message }
  }
  const workers = await db<{ worker_id: string; last_seen_at: Date }[]>`select worker_id, last_seen_at from worker_heartbeats order by last_seen_at desc`.catch(() => [])
  const [backup] = await db<{ value: { file: string; size: number; at: string } }[]>`select value from kv_store where key = 'backup:last'`.catch(() => [])
  let disk: { freeBytes: number; totalBytes: number } | null = null
  try {
    const s = await statfs(storageRoot())
    disk = { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }
  } catch {
    disk = null
  }
  const connectors = await Promise.all(CONNECTORS.map(async (c) => ({ id: c.id, label: c.label, ...(await c.status()) })))
  const e = env()
  return {
    postgres,
    queue: 'PostgreSQL (SELECT … FOR UPDATE SKIP LOCKED) — Redis non requis',
    workers: workers.map((w) => ({ id: w.worker_id, online: Date.now() - w.last_seen_at.getTime() < 60_000, lastSeen: w.last_seen_at })),
    storage: { root: storageRoot(), usedBytes: await dirSize(storageRoot()), disk },
    backup: backup?.value ?? null,
    connectors,
    ai: await aiAvailability(),
    email: { provider: e.EMAIL_PROVIDER, inbound: { imap: !!e.IMAP_HOST, webhook: !!e.INBOUND_WEBHOOK_SECRET } },
  }
}
