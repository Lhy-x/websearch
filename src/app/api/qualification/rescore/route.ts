import { sql } from '@/server/core/db'
import { adminRoute } from '@/server/http/route'
import { recomputeBusiness } from '@/server/business/recompute'

/** Deterministic and cheap (no external call): safe to run inline for a few thousand rows. */
export const POST = adminRoute(async () => {
  const ids = await sql()<{ id: string }[]>`select id from businesses where merged_into is null and archived_at is null limit 20000`
  for (const { id } of ids) await recomputeBusiness(id)
  return { updated: ids.length }
})
