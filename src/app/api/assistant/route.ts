import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { handleAssistantMessage } from '@/server/assistant/service'

export const POST = adminRoute(async ({ body }) => handleAssistantMessage(body.message, body.selection), z.object({ message: z.string().trim().min(2).max(2000), selection: z.array(z.string().uuid()).max(2000).default([]) }))
