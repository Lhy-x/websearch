import { sql } from '@/server/core/db'
import { migrate } from '../../scripts/migrate'
import { resetEnvCache } from '@/server/core/env'

let migrated = false
export async function resetDb() {
  resetEnvCache()
  if (!migrated) {
    await migrate(() => undefined)
    migrated = true
  }
  const db = sql()
  const tables = await db<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename not in ('schema_migrations','website_templates','admin_settings','sales_offers','prompt_strategies')`
  await db.unsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} restart identity cascade`)
  await db`update admin_settings set data = '{}'::jsonb, secrets = '{}'::jsonb, global_pause = false, campaigns_emergency_stop = false`
}

/** Clearly identified TEST data — only ever inserted in the test database. */
export async function insertTestBusiness(o: Partial<{ name: string; email: string | null; phone: string; lat: number; lon: number; sector: string; city: string }> = {}) {
  const db = sql()
  const [b] = await db<{ id: string }[]>`insert into businesses (name, normalized_name, sector, city, country, lat, lon, phone, pipeline_status, tags)
    values (${o.name ?? 'TEST Salon Démo'}, ${(o.name ?? 'test salon demo').toLowerCase()}, ${o.sector ?? 'hair_salon'}, ${o.city ?? 'Rouen'}, 'FR', ${o.lat ?? 49.44}, ${o.lon ?? 1.09}, ${o.phone ?? '+33235000000'}, 'QUALIFIED', '{test-data}') returning id`
  if (o.email !== null) await db`insert into business_contacts (business_id, kind, value, normalized_value, source, status) values (${b!.id}, 'email', ${o.email ?? 'test-prospect@example.test'}, ${o.email ?? 'test-prospect@example.test'}, 'manual', 'SOURCE_CONFIRMED')`
  await db`update businesses set email = ${o.email === null ? null : o.email ?? 'test-prospect@example.test'}, email_status = ${o.email === null ? 'NONE' : 'SOURCE_CONFIRMED'} where id = ${b!.id}`
  return b!.id
}
