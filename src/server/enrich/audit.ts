import { sql } from '../core/db'
import { assertSafeUrl, BlockedUrlError, isPrivateIp, safeFetch } from '../core/safe-fetch'
import { putObject } from '../core/storage'
import { recomputeBusiness } from '../business/recompute'
import { getBrowser } from './browser'
import { extractPage } from './html-extract'
import { isIP } from 'node:net'

export interface AuditIssue {
  code: string
  label: string
  severity: 'high' | 'medium' | 'low' | 'info'
}

export interface AuditFacts {
  httpStatus: number | null
  httpsOk: boolean
  loadMs: number | null
  hasViewport: boolean
  mobileOverflow: boolean | null
  title: string | null
  metaDescription: string | null
  h1Count: number
  formsCount: number
  hasCta: boolean
  hasContactInfo: boolean
  brokenLinks: string[]
  consoleErrors: string[]
  copyrightYear: number | null
  error: string | null
}

const PENALTY = { high: 25, medium: 12, low: 5, info: 0 } as const

/** Pure scoring of audit facts → issues + 0..100 quality score. Unit-tested. */
export function scoreAudit(f: AuditFacts, now = new Date()): { issues: AuditIssue[]; score: number } {
  const issues: AuditIssue[] = []
  const add = (code: string, label: string, severity: AuditIssue['severity']) => issues.push({ code, label, severity })
  if (f.error || f.httpStatus === null) {
    add('unreachable', `Site inaccessible${f.error ? ` (${f.error})` : ''}`, 'high')
    return { issues, score: 0 }
  }
  if (f.httpStatus >= 400) add('http_error', `Le site répond avec une erreur HTTP ${f.httpStatus}`, 'high')
  if (!f.httpsOk) add('no_https', 'Pas de connexion sécurisée HTTPS', 'high')
  if (!f.hasViewport) add('no_viewport', 'Pas de balise viewport : affichage non adapté au mobile', 'high')
  if (f.mobileOverflow) add('mobile_overflow', 'Débordement horizontal sur mobile', 'medium')
  if (f.loadMs !== null && f.loadMs > 5000) add('slow', `Chargement lent (${(f.loadMs / 1000).toFixed(1)} s)`, 'medium')
  else if (f.loadMs !== null && f.loadMs > 3000) add('slowish', `Chargement moyen (${(f.loadMs / 1000).toFixed(1)} s)`, 'low')
  if (!f.title) add('no_title', 'Pas de titre de page', 'medium')
  if (!f.metaDescription) add('no_meta_description', 'Pas de méta-description (référencement)', 'low')
  if (f.h1Count === 0) add('no_h1', 'Aucun titre principal (H1)', 'low')
  if (!f.hasCta) add('no_cta', 'Aucun appel à l’action clair (appel, contact, réservation)', 'medium')
  if (!f.hasContactInfo) add('no_contact', 'Coordonnées difficiles à trouver', 'medium')
  if (f.brokenLinks.length) add('broken_links', `${f.brokenLinks.length} lien(s) interne(s) cassé(s)`, f.brokenLinks.length > 2 ? 'medium' : 'low')
  if (f.consoleErrors.length) add('js_errors', `${f.consoleErrors.length} erreur(s) JavaScript`, 'low')
  if (f.copyrightYear && f.copyrightYear <= now.getFullYear() - 4) add('old_copyright', `Mention de copyright ${f.copyrightYear} (site potentiellement ancien)`, 'low')
  const score = Math.max(0, 100 - issues.reduce((s, i) => s + PENALTY[i.severity], 0))
  return { issues, score }
}

/**
 * Non-intrusive audit of a public website with headless Chromium: one page load per viewport,
 * sample of internal links checked with HEAD/GET. No form submission, no vulnerability scanning.
 * Every request issued by the page is filtered against private/internal addresses (SSRF).
 */
export async function auditWebsite(businessId: string, url: string, opts: { allowPrivate?: boolean; screenshots?: boolean } = {}) {
  assertSafeUrl(url, opts)
  const facts: AuditFacts = { httpStatus: null, httpsOk: false, loadMs: null, hasViewport: false, mobileOverflow: null, title: null, metaDescription: null, h1Count: 0, formsCount: 0, hasCta: false, hasContactInfo: false, brokenLinks: [], consoleErrors: [], copyrightYear: null, error: null }
  let finalUrl = url
  const shots: { desktop?: string; mobile?: string } = {}
  const browser = await getBrowser()
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36 ProspectForgeAudit/0.1', ignoreHTTPSErrors: false })
  const guard = async (route: import('playwright').Route) => {
    const u = new URL(route.request().url())
    if (!opts.allowPrivate) {
      const h = u.hostname.replace(/^\[|\]$/g, '')
      if (!['http:', 'https:', 'data:', 'blob:'].includes(u.protocol) || h === 'localhost' || (isIP(h) && isPrivateIp(h))) return route.abort('blockedbyclient')
    }
    return route.continue()
  }
  await ctx.route('**/*', guard)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && facts.consoleErrors.length < 20) facts.consoleErrors.push(m.text().slice(0, 300))
  })
  page.on('pageerror', (e) => {
    if (facts.consoleErrors.length < 20) facts.consoleErrors.push(e.message.slice(0, 300))
  })
  try {
    const t0 = Date.now()
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
    facts.loadMs = Date.now() - t0
    facts.httpStatus = resp?.status() ?? null
    finalUrl = page.url()
    facts.httpsOk = finalUrl.startsWith('https://') && (await resp?.securityDetails()) !== null
    const html = await page.content()
    const ex = extractPage(html, finalUrl)
    Object.assign(facts, { hasViewport: ex.hasViewport, title: ex.title, metaDescription: ex.metaDescription, h1Count: ex.h1Count, formsCount: ex.formsCount, hasCta: ex.hasCta, copyrightYear: ex.copyrightYear, hasContactInfo: ex.emails.length > 0 || ex.phones.length > 0 || /\b0[1-9](?:[ .-]?\d{2}){4}\b|\+3[23]/.test(html) })
    if (opts.screenshots !== false) {
      const desktop = await page.screenshot({ type: 'jpeg', quality: 70 })
      shots.desktop = `audits/${businessId}/${Date.now()}-desktop.jpg`
      await putObject(shots.desktop, desktop)
    }
    // mobile pass
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await m.route('**/*', guard)
    const mp = await m.newPage()
    try {
      await mp.goto(finalUrl, { waitUntil: 'load', timeout: 30_000 })
      facts.mobileOverflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4)
      if (opts.screenshots !== false) {
        const mob = await mp.screenshot({ type: 'jpeg', quality: 70 })
        shots.mobile = `audits/${businessId}/${Date.now()}-mobile.jpg`
        await putObject(shots.mobile, mob)
      }
    } finally {
      await m.close()
    }
    // internal links sample
    for (const link of ex.internalLinks.filter((l) => !/\.(pdf|jpe?g|png|zip)$/i.test(l)).slice(0, 12)) {
      try {
        const r = await safeFetch(link, { method: 'GET', allowPrivate: opts.allowPrivate, timeoutMs: 8000, maxBytes: 200_000 })
        if (r.status >= 400) facts.brokenLinks.push(`${link} (${r.status})`)
      } catch (e) {
        if (!(e instanceof BlockedUrlError)) facts.brokenLinks.push(`${link} (${(e as Error).message.slice(0, 60)})`)
      }
    }
  } catch (e) {
    facts.error = (e as Error).message.split('\n')[0]!.slice(0, 300)
  } finally {
    await ctx.close()
  }
  const { issues, score } = scoreAudit(facts)
  const db = sql()
  const [row] = await db<{ id: string }[]>`insert into website_audits (business_id, url, final_url, http_status, https_ok, load_ms, has_viewport, mobile_overflow, title, meta_description,
      h1_count, forms_count, has_cta, has_contact_info, internal_links_checked, broken_links, console_errors, issues, quality_score, screenshot_desktop, screenshot_mobile, copyright_year, error)
    values (${businessId}, ${url}, ${finalUrl}, ${facts.httpStatus}, ${facts.httpsOk}, ${facts.loadMs}, ${facts.hasViewport}, ${facts.mobileOverflow}, ${facts.title}, ${facts.metaDescription},
      ${facts.h1Count}, ${facts.formsCount}, ${facts.hasCta}, ${facts.hasContactInfo}, ${Math.min(12, facts.brokenLinks.length)}, ${db.json(facts.brokenLinks)}, ${db.json(facts.consoleErrors)},
      ${db.json(issues as never)}, ${score}, ${shots.desktop ?? null}, ${shots.mobile ?? null}, ${facts.copyrightYear}, ${facts.error})
    returning id`
  const r = await recomputeBusiness(businessId)
  await db`update website_audits set verdict = ${r?.presence ?? null} where id = ${row!.id}`
  return { auditId: row!.id, facts, issues, score, presence: r?.presence }
}
