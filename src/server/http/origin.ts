import { AppError } from '../core/errors'
import { getRuntimeConfig } from '../core/settings'

function originOf(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}

function authorityOrigin(authority: string | null, protocol: string): string | null {
  // Host contains one authority, never a URL, userinfo or a forwarded-host list.
  if (!authority || /[\s,/@?#\\]/.test(authority)) return null
  return originOf(`${protocol}//${authority}`)
}

/** Compare against the browser-facing authority, even when Next builds req.url from its bind address. */
export async function assertSameOrigin(req: Request, configuredBase?: string): Promise<void> {
  const refused = () => { throw new AppError('Origine de la requête refusée', 403, 'ORIGIN_NOT_ALLOWED') }
  const site = req.headers.get('sec-fetch-site')
  // Fetch Metadata is supplied by browsers; scripts on another site cannot override Sec-* headers.
  if (site === 'cross-site' || site === 'same-site') refused()
  const rawOrigin = req.headers.get('origin')
  // Authenticated CLI/API clients may omit Origin. Public provider callbacks do not use this guard.
  if (rawOrigin === null) return
  const origin = originOf(rawOrigin)
  if (!origin) return refused()
  const target = new URL(req.url)
  const forwardedProtocol = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http' ? `${forwardedProtocol}:` : target.protocol
  const allowed = new Set<string | null>([target.origin, authorityOrigin(req.headers.get('host'), protocol)])
  // A proxy may rewrite Host too. Use its forwarded authority only with browser proof of same origin.
  if (site === 'same-origin') allowed.add(authorityOrigin(req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? null, protocol))
  if (allowed.has(origin)) return
  const configured = originOf(configuredBase ?? (await getRuntimeConfig()).APP_BASE_URL)
  if (origin === configured) return
  refused()
}
