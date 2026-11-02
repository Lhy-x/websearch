import { sql } from '../core/db'
import { putObject } from '../core/storage'
import { getBrowser } from '../enrich/browser'
import { getWebsiteVersion } from './service'
import { renderSiteDocument } from './html'

/**
 * Render the current version of a generated site in headless Chromium (from the HTML string — no web
 * server needed) and store desktop, mobile, full-page and thumbnail captures.
 */
export async function captureWebsite(websiteId: string): Promise<{ version: number; assets: { kind: string; path: string }[] }> {
  const v = await getWebsiteVersion(websiteId)
  if (!v) throw new Error('Aucune version à capturer')
  const html = renderSiteDocument(v.config, { mode: 'preview', banner: null })
  const browser = await getBrowser()
  const out: { kind: string; path: string; mime: string; size: number }[] = []
  const shoot = async (kind: string, viewport: { width: number; height: number }, scale: number, fullPage: boolean, mobile = false) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: mobile })
    const page = await ctx.newPage()
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForLoadState('load', { timeout: 6000 }).catch(() => undefined)
      const buf = await page.screenshot({ type: 'jpeg', quality: 78, fullPage })
      const path = `sites/${websiteId}/v${v.version}/${kind}.jpg`
      await putObject(path, buf)
      out.push({ kind, path, mime: 'image/jpeg', size: buf.byteLength })
    } finally {
      await ctx.close()
    }
  }
  await shoot('screenshot_desktop', { width: 1440, height: 900 }, 1, false)
  await shoot('screenshot_mobile', { width: 390, height: 844 }, 2, false, true)
  await shoot('screenshot_full', { width: 1440, height: 900 }, 1, true)
  await shoot('thumbnail', { width: 1280, height: 800 }, 0.4, false)
  const db = sql()
  await db`delete from website_assets where website_id = ${websiteId} and version = ${v.version} and kind in ('screenshot_desktop','screenshot_mobile','screenshot_full','thumbnail')`
  for (const a of out) await db`insert into website_assets (website_id, version, kind, path, mime, size_bytes) values (${websiteId}, ${v.version}, ${a.kind}, ${a.path}, ${a.mime}, ${a.size})`
  return { version: v.version, assets: out }
}
