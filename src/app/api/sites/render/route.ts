import { siteConfigSchema } from '@/lib/site/schema'
import { adminRoute } from '@/server/http/route'
import { renderSiteDocument } from '@/server/sites/html'

/** Live preview for the editor: validates the draft config and returns HTML (shown in a sandboxed iframe). */
export const POST = adminRoute(async ({ body }) => {
  const html = renderSiteDocument(body, { mode: 'editor', banner: null })
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}, siteConfigSchema)
