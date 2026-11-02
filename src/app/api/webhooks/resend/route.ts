import { NextResponse } from 'next/server'
import { getSecret } from '@/server/core/settings'
import { verifySvixSignature } from '@/server/email/providers'
import { processResendEvent, type ResendEvent } from '@/server/email/events'

/** Resend delivery events (Svix-signed). Configure the endpoint URL + secret in the Resend dashboard. */
export async function POST(req: Request) {
  const secret = await getSecret('RESEND_WEBHOOK_SECRET')
  if (!secret) return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET non configuré' }, { status: 503 })
  const body = await req.text()
  const id = req.headers.get('svix-id') ?? ''
  const ok = verifySvixSignature(secret, id, req.headers.get('svix-timestamp') ?? '', body, req.headers.get('svix-signature') ?? '')
  if (!ok) return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
  const r = await processResendEvent(id, JSON.parse(body) as ResendEvent)
  return NextResponse.json(r)
}
