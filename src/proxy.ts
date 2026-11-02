import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

/** Public routes: login, prospect-facing demo previews, unsubscribe, provider webhooks, health. */
const PUBLIC = [/^\/login$/, /^\/preview\//, /^\/u\//, /^\/api\/auth\/login$/, /^\/api\/webhooks\//, /^\/api\/health$/, /^\/api\/unsubscribe\//, /^\/_next\//, /^\/favicon/]

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next()
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (session) return NextResponse.next()
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''
  return NextResponse.redirect(url)
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
