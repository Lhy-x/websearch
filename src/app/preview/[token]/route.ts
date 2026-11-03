import { isHtmlSite } from '@/lib/site/bespoke-schema'
import { glassCsp } from '@/server/sites/glass/document'
import { cookies } from 'next/headers'
import { sql } from '@/server/core/db'
import { lookupPreview } from '@/server/sites/service'
import { renderVersion, businessNameOf } from '@/server/sites/render-any'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  'img-src https: data:',
  'frame-src https://www.openstreetmap.org',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ')

function page(status: number, title: string, text: string) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;color:#333"><div style="text-align:center"><h1 style="font-size:20px">${title}</h1><p>${text}</p></div></body></html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'content-security-policy': CSP },
  })
}

/** Public, unguessable demo URL. No JavaScript, noindex, can expire or be disabled. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const p = await lookupPreview(token)
  if (p.status === 'not_found') return page(404, 'Démonstration introuvable', 'Ce lien n’existe pas.')
  if (p.status === 'disabled') return page(410, 'Démonstration désactivée', 'Cette démonstration n’est plus disponible.')
  if (p.status === 'expired') return page(410, 'Démonstration expirée', 'Cette démonstration a expiré.')
  const isAdmin = !!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))
  if (!isAdmin) {
    const ua = req.headers.get('user-agent') ?? ''
    const bot = /bot|crawler|spider|preview|slurp|facebookexternalhit|curl|wget|headless/i.test(ua)
    if (!bot) {
      const device = /mobile|android|iphone/i.test(ua) ? 'mobile' : 'desktop'
      await sql()`insert into preview_views (website_id, device) values (${p.websiteId}, ${device})`
      await sql()`update generated_websites set view_count = view_count + 1, last_viewed_at = now() where id = ${p.websiteId}`
    }
  }
  const html = await renderVersion(p.config, 'preview', `Démonstration non officielle — maquette proposée à ${businessNameOf(p.config)}, réalisée de façon indépendante.`)
  const policy = (isHtmlSite(p.config) ? !!p.config.glassScene : !!p.config.glass3d) ? glassCsp(html) + '; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox' : CSP
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow, noarchive', 'content-security-policy': policy, 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' },
  })
}
