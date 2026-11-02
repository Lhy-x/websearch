import postgres from 'postgres'
import { env } from './env'

type Sql = postgres.Sql<Record<string, never>>
const g = globalThis as unknown as { __pfSql?: Sql }

/** Shared postgres.js client (one pool per process). */
export function sql(): Sql {
  if (!g.__pfSql) {
    g.__pfSql = postgres(env().DATABASE_URL, {
      max: Number(process.env.PG_POOL_MAX ?? 10),
      idle_timeout: 30,
      connect_timeout: 10,
      onnotice: () => {},
      transform: { undefined: null },
    }) as Sql
  }
  return g.__pfSql
}

export async function closeDb() {
  if (g.__pfSql) {
    await g.__pfSql.end({ timeout: 5 })
    g.__pfSql = undefined
  }
}

export type { Sql }
