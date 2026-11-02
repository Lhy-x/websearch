import { spawn } from 'node:child_process'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { storageRoot } from '../core/storage'
import { sql } from '../core/db'

/** pg_dump (custom format would need pg_restore; plain SQL gzipped is simplest to restore with psql). */
export async function runBackup(databaseUrl: string, log: (m: string) => Promise<void> | void, keep = 14) {
  const dir = path.join(storageRoot(), 'backups')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `prospectforge-${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz`)
  const child = spawn('pg_dump', ['--no-owner', '--no-privileges', databaseUrl], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d) => (stderr += d))
  const exit = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })
  await pipeline(child.stdout, createGzip(), createWriteStream(file))
  const code = await exit
  if (code !== 0) {
    await rm(file, { force: true })
    throw new Error(`pg_dump a échoué (${code}) : ${stderr.slice(0, 500)}`)
  }
  const size = (await stat(file)).size
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql.gz')).sort()
  for (const old of files.slice(0, Math.max(0, files.length - keep))) await rm(path.join(dir, old), { force: true })
  await sql()`insert into kv_store (key, value) values ('backup:last', ${sql().json({ file: path.basename(file), size, at: new Date().toISOString() })})
              on conflict (key) do update set value = excluded.value, updated_at = now()`
  await log(`Sauvegarde ${path.basename(file)} (${Math.round(size / 1024)} Ko)`)
  return { file: path.basename(file), size }
}
