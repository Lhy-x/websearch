import { expect, test } from '@playwright/test'
import postgres from 'postgres'

// Software WebGL makes the real renderer testable on GPU-less CI machines.
test.use({ launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } })

test('3D generation → isolated public preview → editor → standalone export and reduced-motion fallback', async ({ page, request }) => {
  const db = postgres(process.env.E2E_DATABASE_URL ?? 'postgres://pf:pf@localhost:5432/prospectforge_e2e')
  let id: string | undefined
  try {
    const [business] = await db<{ id: string }[]>`insert into businesses (name, normalized_name, sector, city, country, pipeline_status, tags)
      values ('TEST Atelier 3D', 'test atelier 3d', 'hair_salon', 'Rouen', 'FR', 'QUALIFIED', '{test-data}') returning id`
    id = business!.id
    expect((await page.request.post('/api/auth/login', { data: { email: 'admin@e2e.local', password: 'e2e-password-123' } })).ok()).toBeTruthy()
    await page.goto('/generator')
    await expect(page.locator('option[value="glass3d"]')).toHaveCount(1)
    const queued = await page.request.post(`/api/prospects/${id}`, { data: { action: 'generate_site', generator: 'glass3d' } })
    expect(queued.ok()).toBeTruthy()
    const { jobId } = await queued.json()
    let job: { status: string; result: { websiteId: string } }
    await expect.poll(async () => { job = (await (await page.request.get(`/api/jobs/${jobId}`)).json()).job; return job.status }, { timeout: 60_000 }).toBe('COMPLETED')
    const websiteId = job!.result.websiteId
    const [site] = await db<{ preview_token: string }[]>`select preview_token from generated_websites where id = ${websiteId}`
    const preview = await page.goto(`/preview/${site!.preview_token}`)
    expect(preview!.status()).toBe(200)
    expect(preview!.headers()['content-security-policy']).toContain('sandbox allow-scripts')
    expect(preview!.headers()['content-security-policy']).not.toContain('allow-same-origin')
    await page.waitForFunction(() => document.body.classList.contains('glass-ready') && (window as unknown as { __glassSite?: { pieces: unknown[] } }).__glassSite?.pieces.length === 4, undefined, { timeout: 60_000 })
    const before = await page.locator('canvas').screenshot()
    await page.evaluate(() => (window as unknown as { __glassSite: { snap(n: number): void } }).__glassSite.snap(.62))
    const after = await page.locator('canvas').screenshot()
    expect(after.equals(before)).toBe(false)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('body')).not.toHaveClass(/glass-ready/)
    await expect(page.locator('.glass-readable')).toHaveAttribute('open', '')
    await page.goto(`/sites/${websiteId}`)
    await expect(page.getByLabel('Objet 3D')).toBeVisible()
    await page.getByLabel('Objet 3D').selectOption('bolt')
    const frame = page.frameLocator('iframe[title="Aperçu du site"]')
    await expect(frame.locator('canvas')).toHaveCount(1)
    const zip = await page.request.post(`/api/sites/${websiteId}`, { data: { action: 'export', includeMedia: true } })
    expect(zip.ok()).toBeTruthy()
    expect((await zip.body()).subarray(0, 2).toString()).toBe('PK')
    const anon = await request.get(`/preview/${site!.preview_token}`)
    expect(anon.status()).toBe(200)
  } finally {
    if (id) await db`delete from businesses where id = ${id}`
    await db.end()
  }
})
