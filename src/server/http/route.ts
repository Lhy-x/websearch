import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ZodError, type z } from 'zod'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { AppError, errorMessage } from '../core/errors'

export async function requireAdmin(): Promise<{ email: string }> {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value)
  if (!s) throw new AppError('Non authentifié', 401, 'UNAUTHENTICATED')
  return s
}

export function jsonError(e: unknown) {
  if (e instanceof ZodError) return NextResponse.json({ error: 'Données invalides', issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
  console.error('[api]', e)
  return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erreur interne' : errorMessage(e) }, { status: 500 })
}

type Ctx = { params: Promise<Record<string, string | string[]>> }

/**
 * Admin-only API handler wrapper: authentication (defense in depth behind the proxy), Zod body
 * validation, uniform JSON errors.
 */
export function adminRoute<S extends z.ZodType = z.ZodType<unknown>>(
  handler: (args: { req: Request; params: { id: string; [k: string]: string }; body: z.infer<S>; admin: { email: string } }) => Promise<unknown>,
  schema?: S,
) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const admin = await requireAdmin()
      let body: unknown = undefined
      if (schema) {
        const raw = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => {
          throw new AppError('Corps JSON invalide', 400)
        })
        body = schema.parse(raw)
      }
      const params = (await ctx.params) as { id: string; [k: string]: string }
      const out = await handler({ req, params, body: body as z.infer<S>, admin })
      if (out instanceof Response) return out
      return NextResponse.json(out ?? { ok: true })
    } catch (e) {
      return jsonError(e)
    }
  }
}
