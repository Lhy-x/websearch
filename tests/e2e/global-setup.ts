import postgres from 'postgres'

/** Start every E2E run from an empty dedicated database (never the dev/prod one). */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? 'postgres://pf:pf@localhost:5432/prospectforge_e2e'
  if (!/_e2e(\?|$)/.test(url)) throw new Error(`Refus de vider une base qui n'est pas une base E2E : ${url}`)
  const db = postgres(url, { onnotice: () => {} })
  try {
    const tables = await db<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'
      and tablename not in ('schema_migrations','website_templates','admin_settings','sales_offers','prompt_strategies')`
    if (tables.length) await db.unsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} restart identity cascade`)
    await db`update admin_settings set data = '{}'::jsonb, global_pause = false, campaigns_emergency_stop = false`.catch(() => undefined)
  } finally {
    await db.end()
  }
}
