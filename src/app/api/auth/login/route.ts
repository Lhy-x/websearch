import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from '@/server/core/db'
import { env } from '@/server/core/env'
import { verifyPassword } from '@/server/core/crypto'
import { SESSION_COOKIE, SESSION_TTL_S, signSession } from '@/lib/session'
import { auditLog } from '@/server/core/audit'
import { jsonError } from '@/server/http/route'

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) })
const MAX_FAILS = 5

export async function POST(req: Request) {
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'local'
    const db = sql()
    const [{ n } = { n: 0 }] = await db<{ n: number }[]>`select count(*)::int n from login_attempts where ip = ${ip} and not success and created_at > now() - interval '15 minutes'`
    if (n >= MAX_FAILS) return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, { status: 429 })
    const { email, password } = schema.parse(await req.json())
    const e = env()
    if (!e.ADMIN_EMAIL || !e.ADMIN_PASSWORD_HASH) return NextResponse.json({ error: 'Administrateur non configuré (ADMIN_EMAIL / ADMIN_PASSWORD_HASH)' }, { status: 503 })
    const ok = email.toLowerCase() === e.ADMIN_EMAIL.toLowerCase() && (await verifyPassword(password, e.ADMIN_PASSWORD_HASH))
    await db`insert into login_attempts (ip, success) values (${ip}, ${ok})`
    if (!ok) {
      await new Promise((r) => setTimeout(r, 400))
      return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 })
    }
    await auditLog({ action: 'auth.login', actor: email, data: { ip } })
    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, await signSession(e.ADMIN_EMAIL), { httpOnly: true, sameSite: 'lax', secure: e.APP_BASE_URL.startsWith('https'), path: '/', maxAge: SESSION_TTL_S })
    return res
  } catch (err) {
    return jsonError(err)
  }
}
