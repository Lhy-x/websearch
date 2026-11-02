import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { executeAssistantAction } from '@/server/assistant/service'

/** Runs an action the admin explicitly confirmed in the assistant. */
export const POST = adminRoute(async ({ body }) => executeAssistantAction(body.tool, body.input), z.object({ tool: z.string().max(60), input: z.record(z.string(), z.unknown()) }))
