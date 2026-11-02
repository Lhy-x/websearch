import { renderToStaticMarkup } from 'react-dom/server'
import type { SiteConfig } from '@/lib/site/schema'
import { SiteRenderer } from '@/lib/site/render/SiteRenderer'
import { SITE_CSS } from '@/lib/site/render/site-css'
import { googleFontsHref } from '@/lib/site/themes'

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export interface DocumentOptions {
  mode: 'preview' | 'export' | 'editor'
  banner?: string | null
  /** inline the stylesheet (preview) or link ./site.css (export) */
  cssHref?: string
  /** optional view beacon (preview only, when tracking is enabled) */
  beaconUrl?: string | null
}

/** Full standalone HTML document for a site config. React escapes all text content (XSS-safe). */
export function renderSiteDocument(cfg: SiteConfig, opts: DocumentOptions): string {
  const body = renderToStaticMarkup(<SiteRenderer cfg={cfg} opts={{ mode: opts.mode, banner: opts.banner }} />)
  const robots = opts.mode === 'export' ? 'index,follow' : 'noindex,nofollow,noarchive'
  const css = opts.cssHref ? `<link rel="stylesheet" href="${esc(opts.cssHref)}">` : `<style>${SITE_CSS}</style>`
  const beacon = opts.beaconUrl ? `<img src="${esc(opts.beaconUrl)}" alt="" width="1" height="1" style="position:absolute;left:-9999px" referrerpolicy="no-referrer">` : ''
  return `<!doctype html>
<html lang="${esc(cfg.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="${robots}">
<title>${esc(cfg.seo.title)}</title>
<meta name="description" content="${esc(cfg.seo.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(googleFontsHref(cfg.theme))}">
${css}
</head>
<body>${body}${beacon}</body>
</html>`
}
