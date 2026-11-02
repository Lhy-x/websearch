import { parse, type HTMLElement } from 'node-html-parser'

/**
 * AI-written HTML is treated as untrusted. Allowlist approach:
 *  - no JavaScript (script, event handlers, javascript: URLs), no forms, no embeds/objects/frames
 *    (except the OpenStreetMap embed), no <base>, no meta refresh
 *  - stylesheets only from Google Fonts; CSS @import only Google Fonts; no expression()/behaviour
 *  - images only data:/inline SVG or URLs explicitly provided as licensed media (no hotlinked "photos")
 * The public preview additionally sends a CSP without script-src, so even a sanitizer bug can't run JS.
 */
const DROP_TAGS = new Set(['script', 'noscript', 'object', 'embed', 'applet', 'base', 'frame', 'frameset', 'form', 'input', 'textarea', 'select', 'button', 'template', 'portal', 'canvas', 'audio', 'video', 'track', 'source', 'dialog', 'slot'])
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background', 'cite', 'srcset', 'data']
const OSM_EMBED = /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/
const GOOGLE_FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//

export interface SanitizeResult {
  html: string
  removed: string[]
}

function safeUrl(v: string, attr: string, media: Set<string>): boolean {
  const u = v.trim()
  if (/^#[\w-]*$/.test(u)) return true
  if (/^(tel|mailto):/i.test(u)) return !/[<>"]/.test(u)
  if (attr === 'href') return /^https:\/\//i.test(u) && !/^https?:\/\/(localhost|127\.|10\.|192\.168\.)/i.test(u)
  if (attr === 'src' || attr === 'srcset' || attr === 'poster' || attr === 'background') {
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(u)) return true
    return media.has(u)
  }
  return false
}

export function sanitizeCss(css: string, media: Set<string>, removed: string[]): string {
  let out = css.replace(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi, (m, url: string) => {
    if (GOOGLE_FONTS.test(url)) return m
    removed.push(`@import ${url}`)
    return ''
  })
  out = out.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, _q, url: string) => {
    const u = url.trim()
    if (/^data:(image|font)\//i.test(u) || /^#/.test(u) || GOOGLE_FONTS.test(u) || media.has(u)) return m
    removed.push(`url(${u.slice(0, 80)})`)
    return 'none'
  })
  out = out.replace(/expression\s*\(|-moz-binding|behavior\s*:|javascript:/gi, (m) => {
    removed.push(m)
    return ''
  })
  return out.replace(/<\/style/gi, '')
}

function walk(el: HTMLElement, media: Set<string>, removed: string[]) {
  for (const child of [...el.childNodes]) {
    if (child.nodeType !== 1) continue
    const c = child as HTMLElement
    const tag = (c.rawTagName ?? '').toLowerCase()
    if (DROP_TAGS.has(tag)) {
      removed.push(`<${tag}>`)
      c.remove()
      continue
    }
    if (tag === 'iframe' && !OSM_EMBED.test(c.getAttribute('src') ?? '')) {
      removed.push('<iframe>')
      c.remove()
      continue
    }
    if (tag === 'meta' && /refresh|set-cookie|content-security/i.test(c.getAttribute('http-equiv') ?? '')) {
      removed.push('<meta http-equiv>')
      c.remove()
      continue
    }
    if (tag === 'link') {
      const rel = (c.getAttribute('rel') ?? '').toLowerCase()
      const href = c.getAttribute('href') ?? ''
      if (!((rel === 'stylesheet' || rel === 'preconnect') && GOOGLE_FONTS.test(href))) {
        removed.push(`<link ${rel} ${href.slice(0, 60)}>`)
        c.remove()
        continue
      }
    }
    if (tag === 'img' && !safeUrl(c.getAttribute('src') ?? '', 'src', media)) {
      removed.push(`<img ${(c.getAttribute('src') ?? '').slice(0, 60)}>`)
      c.remove()
      continue
    }
    if (tag === 'style') {
      c.set_content(sanitizeCss(c.textContent, media, removed))
      continue
    }
    for (const [name, value] of Object.entries(c.attributes)) {
      const n = name.toLowerCase()
      if (n.startsWith('on') || n === 'srcdoc' || n === 'formaction') {
        removed.push(`@${n}`)
        c.removeAttribute(name)
      } else if (URL_ATTRS.includes(n) && !(tag === 'iframe' && n === 'src') && !(tag === 'link' && n === 'href')) {
        const ok = n === 'srcset' ? value.split(',').every((part) => safeUrl(part.trim().split(/\s+/)[0] ?? '', 'srcset', media)) : safeUrl(value, n, media)
        if (!ok) {
          removed.push(`@${n}=${value.slice(0, 60)}`)
          c.removeAttribute(name)
        }
      } else if (n === 'style') {
        c.setAttribute('style', sanitizeCss(value, media, removed))
      }
    }
    if (tag === 'a' && /^https:/i.test(c.getAttribute('href') ?? '')) {
      c.setAttribute('rel', 'noopener noreferrer nofollow')
      c.setAttribute('target', '_blank')
    }
    walk(c, media, removed)
  }
}

export function sanitizeSiteHtml(raw: string, mediaUrls: string[] = []): SanitizeResult {
  const removed: string[] = []
  const media = new Set(mediaUrls)
  const src = raw.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '')
  const root = parse(src, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } })
  walk(root as unknown as HTMLElement, media, removed)
  let html = root.toString()
  if (!/^\s*<!doctype html>/i.test(html)) html = `<!doctype html>\n${html}`
  return { html, removed }
}
