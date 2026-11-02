import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { closeDb, sql } from '../src/server/core/db'
import { seedDefaults } from '../src/server/seed'

/** Apply db/migrations/*.sql in order, once each, inside a transaction per file. */
export async function migrate(log = console.log) {
  const db = sql()
  await db`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`
  const dir = path.resolve(process.cwd(), 'db/migrations')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const done = new Set((await db<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name))
  for (const f of files) {
    if (done.has(f)) continue
    const content = await readFile(path.join(dir, f), 'utf8')
    await db.begin(async (tx) => {
      await tx.unsafe(content)
      await tx`insert into schema_migrations (name) values (${f})`
    })
    log(`✔ migration ${f}`)
  }
  await seedDefaults()
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  migrate()
    .then(() => console.log('Migrations à jour'))
    .catch((e) => {
      console.error(e)
      process.exitCode = 1
    })
    .finally(closeDb)
}
