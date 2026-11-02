import { sql } from './db'

export async function auditLog(entry: {
  action: string
  entityType?: string
  entityId?: string | null
  actor?: string
  level?: 'info' | 'warn' | 'error'
  data?: unknown
}) {
  await sql()`
    insert into audit_logs (actor, action, entity_type, entity_id, level, data)
    values (${entry.actor ?? 'system'}, ${entry.action}, ${entry.entityType ?? null}, ${entry.entityId ?? null},
            ${entry.level ?? 'info'}, ${entry.data === undefined ? null : sql().json(entry.data as never)})`
}
