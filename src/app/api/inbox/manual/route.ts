import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { processInbound } from '@/server/email/inbound'

/** Record an email received outside the IMAP/webhook pipelines (copy-paste). Goes through the same processing. */
export const POST = adminRoute(async ({ body }) => processInbound({ ...body, source: 'manual' }), z.object({ from: z.string().email(), subject: z.string().max(500).default(''), text: z.string().min(1).max(100000), inReplyTo: z.string().max(500).optional().nullable(), messageId: z.string().max(500).optional().nullable() }))
