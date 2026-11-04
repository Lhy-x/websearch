import { adminRoute } from '@/server/http/route'
import { workspaceProgress } from '@/server/analytics/progress'
export const GET=adminRoute(async()=>workspaceProgress())
