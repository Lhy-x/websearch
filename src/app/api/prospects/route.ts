import { adminRoute } from '@/server/http/route'
import { listBusinesses, listFiltersSchema } from '@/server/business/queries'

export const GET = adminRoute(async ({ body }) => listBusinesses(body), listFiltersSchema)
