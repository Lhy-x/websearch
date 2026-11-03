import { afterAll, beforeEach, expect, it } from 'vitest'
import { parse } from 'node-html-parser'
import { getBrowser, closeBrowser } from '@/server/enrich/browser'
import { closeDb } from '@/server/core/db'
import { generateWebsite, getWebsiteVersion, saveWebsiteVersion, lookupPreview } from '@/server/sites/service'
import { renderVersion } from '@/server/sites/render-any'
import { glassCsp } from '@/server/sites/glass/document'
import { exportSiteZip } from '@/server/sites/export'
import { siteConfigSchema } from '@/lib/site/schema'
import { resetDb, insertTestBusiness } from './helpers'
import { writeFile } from 'node:fs/promises'

beforeEach(resetDb)
afterAll(async () => { await closeBrowser(); await closeDb() })

it('generates and persists an editable 3D site without AI, renders escaped facts and embeds all runtime assets', async () => {
  const id = await insertTestBusiness({ name: 'TEST <script>alert("x")</script> Atelier' })
  const g = await generateWebsite(id, { generator: 'glass3d' })
  expect(g.generator).toBe('glass3d')
  expect(g.costUsd).toBe(0)
  const v = await getWebsiteVersion(g.websiteId)
  const cfg = siteConfigSchema.parse(v!.config)
  expect(cfg.glass3d).toEqual({ shape: 'spark' })
  expect((await lookupPreview(g.previewToken)).status).toBe('ok')
  const html = await renderVersion(cfg, 'preview', 'Démonstration non officielle')
  const root = parse(html, { blockTextElements: { script: true, style: true } })
  expect(root.querySelector('canvas#webgl')).not.toBeNull()
  expect(root.querySelectorAll('script')).toHaveLength(2)
  expect(html).not.toContain('<script>alert("x")</script>')
  expect(html).not.toMatch(/src="\.\/|href="\.\/|{{\w+}}/)
  expect(html).toContain('data:text/javascript;base64,')
  expect(html).toContain('data:font/ttf;base64,')
  expect(root.querySelector('.glass-readable')?.textContent).toContain('TEST <script>')
  expect(root.querySelector('.figures')).toBeNull()
  expect(root.querySelector('form')).toBeNull()
  const policy = glassCsp(html)
  expect(policy).toContain('sha256-')
  expect(policy).not.toContain("script-src 'unsafe-inline'")
  expect(policy).toContain("connect-src 'none'")
  expect(root.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex')
  cfg.glass3d = { shape: 'bolt' }
  expect(await saveWebsiteVersion(g.websiteId, cfg, { baseVersion: 1 })).toBe(2)
  expect(siteConfigSchema.parse((await getWebsiteVersion(g.websiteId))!.config).glass3d?.shape).toBe('bolt')
  expect(() => siteConfigSchema.parse({ ...cfg, glass3d: { shape: '../../anything' } })).toThrow()
  const exported = await renderVersion(cfg, 'export')
  expect(exported).toContain('index,follow')
  expect(exported).not.toContain('Démonstration non officielle')
  const zip = await exportSiteZip(cfg)
  expect(zip.buffer.subarray(0, 2).toString()).toBe('PK')
  // Leave a current-run fixture for browser validation outside the repository.
  if (process.env.GLASS_TEST_ARTIFACT_DIR) {
    await writeFile(`${process.env.GLASS_TEST_ARTIFACT_DIR}/glass.html`, exported)
    await writeFile(`${process.env.GLASS_TEST_ARTIFACT_DIR}/glass.zip`, zip.buffer)
  }
})

it('renders real WebGL on mobile and switches to readable content when motion is reduced', async () => {
  const id = await insertTestBusiness({ name: 'TEST Mobile 3D' })
  const generated = await generateWebsite(id, { generator: 'glass3d' })
  const version = (await getWebsiteVersion(generated.websiteId))!
  const html = await renderVersion(version.config, 'export')
  const browser = await getBrowser({ softwareWebGL: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const page = await context.newPage()
  try {
    await page.route('https://**/*', route => route.abort())
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!document.documentElement.dataset.glassState, undefined, { timeout: 20_000 })
    expect(await page.locator('html').getAttribute('data-glass-state')).toBe('ready')
    expect(await page.evaluate(() => (window as unknown as { __glassSite: { pieces: unknown[] } }).__glassSite.pieces.length)).toBe(4)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForFunction(() => !document.body.classList.contains('glass-ready'))
    expect(await page.locator('.glass-readable').getAttribute('open')).toBe('')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392)
    expect(await page.locator('.glass-readable').innerText()).toContain('TEST Mobile 3D')
  } finally { await context.close() }
}, 60_000)
