import { adminRoute } from '@/server/http/route'
import { CONNECTORS } from '@/server/connectors'

export const GET = adminRoute(async () => Promise.all(CONNECTORS.map(async (c) => ({ id: c.id, label: c.label, ...(await c.status()) }))))
