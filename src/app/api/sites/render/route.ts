import { websiteVersionSchema, isHtmlSite } from '@/lib/site/bespoke-schema'
import { adminRoute } from '@/server/http/route'
import { renderPersonalizedDocument } from '@/server/sites/glass/personalized-document'
import { renderGlassDocument } from '@/server/sites/glass/document'
import { renderSiteDocument } from '@/server/sites/html'
import { renderBespokeDocument } from '@/server/sites/bespoke/document'
import { sanitizeSiteHtml } from '@/server/sites/bespoke/sanitize'

/** Live preview for the editor: validates (and for HTML sites, sanitizes) the draft, returns HTML for a sandboxed iframe. */
export const POST = adminRoute(async ({ body }) => {
  const html = isHtmlSite(body)
    ? (body.glassScene ? await renderPersonalizedDocument(body,{mode:'editor'}) : renderBespokeDocument({ ...body, html: sanitizeSiteHtml(body.html, body.media.map((m) => m.url)).html }, { mode: 'editor' }))
    : body.glass3d ? await renderGlassDocument(body, { mode: 'editor', banner: null }) : renderSiteDocument(body, { mode: 'editor', banner: null })
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}, websiteVersionSchema)
