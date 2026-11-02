import { parse } from 'node-html-parser'
import { normalizeEmail, normalizeUrl, socialNetworkOf } from '../core/normalize'

export interface PageExtract {
  title: string | null
  metaDescription: string | null
  hasViewport: boolean
  h1Count: number
  formsCount: number
  hasCta: boolean
  emails: string[]
  phones: string[]
  socials: string[]
  internalLinks: string[]
  contactLinks: string[]
  copyrightYear: number | null
  textLength: number
}

const CTA_RE = /\b(contact|contactez|réserv|reserv|rendez-vous|rdv|devis|appel|commander|book|prendre)\w*/i

/** De-obfuscate common "name [at] domain [dot] fr" patterns, then extract emails. */
export function extractEmails(text: string): string[] {
  const deob = text
    .replace(/\s*(\[|\(|\{)\s*(at|arobase|@)\s*(\]|\)|\})\s*/gi, '@')
    .replace(/\s*(\[|\(|\{)\s*(dot|point|\.)\s*(\]|\)|\})\s*/gi, '.')
  const found = deob.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi) ?? []
  return [...new Set(found.map((e) => normalizeEmail(e)).filter((e): e is string => !!e))]
}

/** Parse untrusted HTML into facts. Nothing from the page is ever executed or re-rendered as HTML. */
export function extractPage(html: string, pageUrl: string): PageExtract {
  // separate adjacent elements so their texts don't merge ("Écrire" + "rdv@…" → "crirerdv@…")
  const root = parse(html.replace(/>(?=<)/g, '> '), { blockTextElements: { script: false, style: false, noscript: false } })
  const base = new URL(pageUrl)
  const links = root.querySelectorAll('a[href]').map((a) => a.getAttribute('href') ?? '')
  const abs = links
    .map((h) => {
      try {
        return new URL(h, base).toString()
      } catch {
        return null
      }
    })
    .filter((u): u is string => !!u)
  const mailto = links.filter((h) => h.toLowerCase().startsWith('mailto:')).map((h) => normalizeEmail(decodeURIComponent(h.slice(7))))
  const tel = links.filter((h) => h.toLowerCase().startsWith('tel:')).map((h) => decodeURIComponent(h.slice(4)).trim())
  const text = root.textContent.replace(/\s+/g, ' ')
  const internal = [...new Set(abs.filter((u) => /^https?:/.test(u) && new URL(u).hostname === base.hostname).map((u) => u.split('#')[0]!))]
  const socials = [...new Set(abs.filter((u) => socialNetworkOf(u)).map((u) => normalizeUrl(u)).filter((u): u is string => !!u))]
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]))
  const buttons = root.querySelectorAll('a,button').map((b) => b.textContent.trim()).filter(Boolean)
  return {
    title: root.querySelector('title')?.textContent.trim() || null,
    metaDescription: root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || null,
    hasViewport: !!root.querySelector('meta[name="viewport"]'),
    h1Count: root.querySelectorAll('h1').length,
    formsCount: root.querySelectorAll('form').length,
    hasCta: tel.length > 0 || mailto.length > 0 || buttons.some((b) => b.length < 40 && CTA_RE.test(b)),
    emails: [...new Set([...mailto.filter((e): e is string => !!e), ...extractEmails(text)])],
    phones: [...new Set(tel)],
    socials,
    internalLinks: internal.slice(0, 200),
    contactLinks: internal.filter((u) => /contact|mentions|legal|a-propos|about|qui-sommes/i.test(u)).slice(0, 4),
    copyrightYear: years.length ? Math.max(...years) : null,
    textLength: text.length,
  }
}
