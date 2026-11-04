import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from '@/server/core/db'
import { env } from '@/server/core/env'
import { getRuntimeConfig } from '@/server/core/settings'
import { verifyPassword } from '@/server/core/crypto'
import { SESSION_COOKIE, SESSION_TTL_S, signSession } from '@/lib/session'
import { auditLog } from '@/server/core/audit'
import { jsonError } from '@/server/http/route'

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(200), next: z.string().optional() })
const MAX_FAILS = 5
function localPath(value: string | undefined) {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\x00-\x1f]/.test(value) ? value : '/'
}

export async function POST(req: Request) {
  const type=req.headers.get('content-type')??''
  const native=type.includes('application/x-www-form-urlencoded')||type.includes('multipart/form-data')
  const failure=(error:string,status:number,code:string)=>native
    ? NextResponse.redirect(new URL(`/login?error=${code}`,req.url),303)
    : NextResponse.json({error},{status})
  try {
    const e=env()
    const runtime=await getRuntimeConfig()
    // Native forms can submit before hydration; permit same-origin only, never credentials in a GET URL.
    const origin=req.headers.get('origin')
    if(native && (req.headers.get('sec-fetch-site')==='cross-site' || (origin && origin!==new URL(req.url).origin && origin!==new URL(runtime.APP_BASE_URL).origin))) {
      return NextResponse.json({error:'Origine de connexion non autorisée'},{status:403})
    }
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'local'
    const db = sql()
    const [{ n } = { n: 0 }] = await db<{ n: number }[]>`select count(*)::int n from login_attempts where ip = ${ip} and not success and created_at > now() - interval '15 minutes'`
    if (n >= MAX_FAILS) return failure('Trop de tentatives. Réessayez dans 15 minutes.',429,'limited')
    const raw=native?Object.fromEntries(await req.formData()):await req.json()
    const parsed=schema.safeParse(raw)
    if(!parsed.success)return failure('Saisissez un email et un mot de passe valides.',400,'invalid')
    const {email,password,next}=parsed.data
    if (!e.ADMIN_EMAIL || !e.ADMIN_PASSWORD_HASH) return failure('Administrateur non configuré (ADMIN_EMAIL / ADMIN_PASSWORD_HASH)',503,'configuration')
    const ok = email.toLowerCase() === e.ADMIN_EMAIL.toLowerCase() && (await verifyPassword(password, e.ADMIN_PASSWORD_HASH))
    await db`insert into login_attempts (ip, success) values (${ip}, ${ok})`
    if (!ok) {
      await new Promise((r) => setTimeout(r, 400))
      return failure('Identifiants incorrects',401,'credentials')
    }
    await auditLog({ action: 'auth.login', actor: email, data: { ip } })
    const res = native?NextResponse.redirect(new URL(localPath(next),req.url),303):NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, await signSession(e.ADMIN_EMAIL), { httpOnly: true, sameSite: 'lax', secure: new URL(req.url).protocol==='https:' || (req.headers.get('x-forwarded-proto')??'').split(',')[0]?.trim()==='https', path: '/', maxAge: SESSION_TTL_S })
    return res
  } catch (err) {
    return jsonError(err)
  }
}
