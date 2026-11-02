import { parse } from 'node-html-parser'
import type { HtmlSite } from '@/lib/site/bespoke-schema'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * Final document for a bespoke site: robots meta for previews, viewport/charset guaranteed, demo banner
 * and disclaimer injected by the application (never left to the model).
 */
export function renderBespokeDocument(site: HtmlSite, opts: { mode: 'preview' | 'export' | 'editor'; banner?: string | null; disclaimer?: string | null }): string {
  const root = parse(site.html, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } })
  let head = root.querySelector('head')
  const html = root.querySelector('html')
  if (!head && html) {
    html.insertAdjacentHTML('afterbegin', '<head></head>')
    head = root.querySelector('head')
  }
  if (head) {
    head.querySelectorAll('meta[name="robots"]').forEach((n) => n.remove())
    head.insertAdjacentHTML('afterbegin', `<meta charset="utf-8"><meta name="robots" content="${opts.mode === 'export' ? 'index,follow' : 'noindex,nofollow,noarchive'}">`)
    if (!head.querySelector('meta[name="viewport"]')) head.insertAdjacentHTML('beforeend', '<meta name="viewport" content="width=device-width, initial-scale=1">')
    head.querySelectorAll('meta[charset]').slice(1).forEach((n) => n.remove())
  }
  const body = root.querySelector('body')
  if (body && opts.banner) {
    body.insertAdjacentHTML('afterbegin', `<div role="note" style="all:initial;display:block;box-sizing:border-box;width:100%;background:#111;color:#fff;font:500 13px/1.4 system-ui,sans-serif;text-align:center;padding:8px 16px;position:relative;z-index:2147483647">${esc(opts.banner)}</div>`)
  }
  if (body && opts.disclaimer && opts.mode !== 'export') {
    body.insertAdjacentHTML('beforeend', `<p style="all:initial;display:block;box-sizing:border-box;padding:16px;text-align:center;font:12px/1.5 system-ui,sans-serif;color:#666;background:#fff">${esc(opts.disclaimer)}</p>`)
  }
  let out = root.toString()
  if (!/^\s*<!doctype html>/i.test(out)) out = `<!doctype html>\n${out}`
  return out
}
