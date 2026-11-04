import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getSecret } from '@/server/core/settings'
import { processInbound } from '@/server/email/inbound'

const schema = z.object({
  from: z.string().min(3).max(320),
  to: z.string().max(320).optional().nullable(),
  subject: z.string().max(1000).optional().nullable(),
  text: z.string().max(200000).optional().nullable(),
  messageId: z.string().max(1000).optional().nullable(),
  inReplyTo: z.string().max(1000).optional().nullable(),
  references: z.string().max(5000).optional().nullable(),
  headers: z.record(z.string(), z.string()).optional(),
})

/**
 * Generic inbound-email webhook (for providers with inbound parsing: Resend inbound, Postmark, Mailgun
 * routes via a small adapter, or a test). Auth: `Authorization: Bearer <INBOUND_WEBHOOK_SECRET>`.
 */
export async function POST(req: Request) {
  const secret = await getSecret('INBOUND_WEBHOOK_SECRET')
  if (!secret) return NextResponse.json({ error: 'INBOUND_WEBHOOK_SECRET non configuré' }, { status: 503 })
  const got = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''))
  const exp = Buffer.from(secret)
  if (got.length !== exp.length || !timingSafeEqual(got, exp)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Payload invalide', issues: parsed.error.issues }, { status: 400 })
  const r = await processInbound({ ...parsed.data, source: 'webhook' })
  return NextResponse.json(r)
}
