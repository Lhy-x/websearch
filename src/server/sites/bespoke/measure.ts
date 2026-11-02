import { getBrowser } from '../../enrich/browser'
import type { QualityIssue } from '@/lib/site/bespoke-schema'

/**
 * Rendered checks in headless Chromium (mobile 390 px + desktop 1440 px): horizontal overflow,
 * tiny text, small tap targets, missing focus styles are reported back to the model for a correction pass.
 * External requests other than Google Fonts / OSM tiles are blocked during measurement.
 */
export async function measureRendered(html: string): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = []
  const browser = await getBrowser()
  for (const vp of [{ w: 390, h: 844, label: 'mobile (390 px)', mobile: true }, { w: 1440, h: 900, label: 'ordinateur (1440 px)', mobile: false }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile, javaScriptEnabled: false })
    await ctx.route('**/*', (r) => {
      const u = r.request().url()
      return u.startsWith('data:') || u === 'about:blank' || /^https:\/\/(fonts\.(googleapis|gstatic)\.com|www\.openstreetmap\.org|[a-c]\.tile\.openstreetmap\.org)\//.test(u) ? r.continue() : r.abort()
    })
    const page = await ctx.newPage()
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => undefined)
      const m = await page.evaluate(`(() => {
        const doc = document.documentElement
        const overflow = doc.scrollWidth - window.innerWidth
        const wide = []
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.right > window.innerWidth + 2 && getComputedStyle(el).position !== 'fixed') { wide.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')); if (wide.length > 4) break }
        }
        let tiny = 0
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const t = walker.currentNode
          if (!t.textContent.trim()) continue
          const el = t.parentElement
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden') continue
          if (parseFloat(cs.fontSize) < 12) tiny++
        }
        let smallTargets = 0
        for (const a of document.querySelectorAll('a[href], summary')) {
          const r = a.getBoundingClientRect()
          if (r.width > 0 && r.height > 0 && r.height < 32 && r.width < 120) smallTargets++
        }
        const h = document.body.scrollHeight
        return { overflow, wide, tiny, smallTargets, h }
      })()`)
      const r = m as { overflow: number; wide: string[]; tiny: number; smallTargets: number; h: number }
      if (r.overflow > 2) issues.push({ code: 'overflow', severity: 'major', message: `Débordement horizontal de ${r.overflow} px en ${vp.label} (éléments : ${r.wide.join(', ') || 'inconnus'})` })
      if (r.tiny > 3) issues.push({ code: 'tiny_text', severity: 'minor', message: `${r.tiny} blocs de texte < 12 px en ${vp.label}` })
      if (vp.mobile && r.smallTargets > 3) issues.push({ code: 'tap_targets', severity: 'minor', message: `${r.smallTargets} liens avec une zone tactile < 32 px de haut sur mobile` })
      if (r.h < vp.h * 1.2) issues.push({ code: 'short', severity: 'minor', message: `Page très courte en ${vp.label} (${r.h} px)` })
    } catch (e) {
      issues.push({ code: 'render_error', severity: 'major', message: `Rendu impossible en ${vp.label} : ${(e as Error).message.slice(0, 160)}` })
    } finally {
      await ctx.close()
    }
  }
  return issues
}

/** Screenshots for the model's visual self-review: desktop first screens + mobile page (JPEG, bounded size). */
export async function captureForReview(html: string): Promise<{ mediaType: 'image/jpeg'; data: string }[]> {
  const browser = await getBrowser()
  const out: { mediaType: 'image/jpeg'; data: string }[] = []
  for (const vp of [{ w: 1440, h: 900, scale: 0.6, maxH: 2400, mobile: false }, { w: 390, h: 844, scale: 1, maxH: 2600, mobile: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.scale, isMobile: vp.mobile, javaScriptEnabled: false })
    const page = await ctx.newPage()
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForLoadState('load', { timeout: 6000 }).catch(() => undefined)
      const height = Math.min(vp.maxH, await page.evaluate('document.documentElement.scrollHeight') as number)
      const buf = await page.screenshot({ type: 'jpeg', quality: 72, fullPage: true, clip: { x: 0, y: 0, width: vp.w, height } })
      out.push({ mediaType: 'image/jpeg', data: buf.toString('base64') })
    } finally {
      await ctx.close()
    }
  }
  return out
}
