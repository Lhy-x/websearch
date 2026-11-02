import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { estimateCost } from '@/server/ai/estimate'

export const GET = adminRoute(async ({ body }) => estimateCost(body.task, body.count), z.object({ task: z.enum(['site_generation', 'proposal', 'reply_classification', 'reply_draft', 'analysis']), count: z.coerce.number().int().min(1).max(10000) }))
