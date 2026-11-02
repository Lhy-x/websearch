import { adminRoute } from '@/server/http/route'
import { exportCsv, listFiltersSchema } from '@/server/business/queries'

export const GET = adminRoute(async ({ body }) => {
  const csv = await exportCsv(body)
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="prospects-${new Date().toISOString().slice(0, 10)}.csv"` } })
}, listFiltersSchema)
