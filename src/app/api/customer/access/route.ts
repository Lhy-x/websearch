import { NextResponse } from 'next/server'
import { AppError } from '@/server/core/errors'
import { assertSameOrigin } from '@/server/http/origin'
import { requestCustomerAccess } from '@/server/billing/customer-access'

const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' }

export async function POST(req: Request) {
  try {
    await assertSameOrigin(req)
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'local'
    const body = (await req.json().catch(() => ({}))) as { email?: unknown }
    return NextResponse.json(await requestCustomerAccess(body.email, ip), { headers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof AppError ? error.message : 'Service momentanément indisponible. Réessayez dans quelques instants.' }, { status: error instanceof AppError ? error.status : 503, headers })
  }
}
