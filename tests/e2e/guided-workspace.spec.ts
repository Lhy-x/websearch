import { test, expect } from '@playwright/test'
import postgres from 'postgres'

const CORE = ['/', '/prospects', '/search', '/generator', '/sites', '/sales', '/settings', '/settings?tab=payment', '/guide', '/campaigns', '/campaigns/new', '/inbox', '/crm', '/qualification', '/automations', '/analytics', '/assistant']
async function login(page: import('@playwright/test').Page) {
  expect((await page.request.post('/api/auth/login', { data: { email: 'admin@e2e.local', password: 'e2e-password-123' } })).ok()).toBeTruthy()
}

test('guided workspace: deep links, keyboard search, mobile menu, themes and responsive pages', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await login(page)
  await page.request.put('/api/settings', { data: { ai: { provider: 'none' } } })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Navigation principale', exact: true }).getByRole('link')).toHaveCount(5)
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true })
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('searchbox').or(page.getByRole('textbox', { name: 'Recherche globale' }))).toBeFocused()
  await page.getByRole('textbox', { name: 'Recherche globale' }).fill('Client Vente')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/prospects\?q=Client/)
  await page.goto('/settings?tab=payment')
  await expect(page.getByRole('tab', { name: 'Paiement', exact: true })).toHaveAttribute('data-state', 'active')
  await expect(page.getByRole('spinbutton', { name: /Prix unique/ })).toBeVisible()
  await page.goto('/generator')
  await expect(page.getByRole('link', { name: 'Connecter mon IA' })).toHaveAttribute('href', '/settings?tab=ai')
  await page.screenshot({ path: testInfo.outputPath('generator-desktop.png'), fullPage: true })
  await page.goto('/guide')
  await page.getByRole('button', { name: 'Changer de thème' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ path: testInfo.outputPath('guide-dark.png'), fullPage: true })
  await page.getByRole('button', { name: 'Changer de thème' }).click()
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    for (const url of CORE) {
      expect((await page.goto(url))?.status(), url).toBe(200)
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth), `${url} at ${width}px`).toBeLessThanOrEqual(width + 1)
    }
    await page.goto('/')
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    const dialog = page.getByRole('dialog', { name: 'Menu de navigation' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Mes démos', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Outils avancés' }).click()
    await expect(dialog.getByRole('link', { name: 'Statistiques' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeFocused()
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByRole('navigation', { name: 'Navigation mobile', exact: true }).getByRole('link', { name: 'Mes démos' }).click()
    await expect(page).toHaveURL(/\/sites$/)
    await expect(dialog).toHaveCount(0)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.screenshot({ path: testInfo.outputPath('overview-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(page.locator('.app-content')).not.toHaveAttribute('inert')
  expect(errors).toEqual([])
})

test('one creation action shows progress then opens the editor; draft and preview fit mobile', async ({ page }, testInfo) => {
  const db = postgres(process.env.E2E_DATABASE_URL ?? 'postgres://pf:pf@localhost:5432/prospectforge_e2e')
  let businessId: string | undefined
  try {
    const [business] = await db<{ id: string }[]>`insert into businesses(name,normalized_name,sector,city,country,email,email_status,score,pipeline_status,tags) values('TEST Atelier Interface','test atelier interface','hair_salon','Rouen','FR','atelier@example.test','SOURCE_CONFIRMED',70,'QUALIFIED','{test-data}') returning id`
    businessId = business!.id
    await login(page)
    await page.request.put('/api/settings', { data: { ai: { provider: 'none' } } })
    const response = await page.request.post(`/api/prospects/${businessId}`, { data: { action: 'generate_site', generator: 'deterministic' } })
    const { jobId } = await response.json()
    let websiteId: string | undefined
    await expect.poll(async () => { const { job } = await (await page.request.get(`/api/jobs/${jobId}`)).json(); websiteId = job.result?.websiteId; return job.status }, { timeout: 90000 }).toBe('COMPLETED')
    // Exercise the UI state machine with a local fixture; no external AI request is sent.
    await page.request.post('/api/settings', { data: { action: 'secret', key: 'OPENAI_API_KEY', value: 'sk-test-ui-fixture-only' } })
    await page.request.put('/api/settings', { data: { ai: { provider: 'openai', costMode: 'BALANCED', cheapModel: 'fixture', strongModel: 'fixture' } } })
    await page.route(`**/api/prospects/${businessId}`, route => route.request().method() === 'POST' ? route.fulfill({ json: { jobId: 'ui-fixture' } }) : route.continue())
    let polls = 0
    await page.route('**/api/jobs/ui-fixture', route => route.fulfill({ json: { job: ++polls <= 2 ? { status: 'RUNNING', error: null, result: null } : { status: 'COMPLETED', error: null, result: { websiteId } } } }))
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/generator?business=${businessId}`)
    await page.getByRole('button', { name: 'Créer le site sur mesure', exact: true }).click()
    await expect(page.getByText('Votre site prend forme…', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/sites/${websiteId}$`), { timeout: 20000 })
    await expect(page.getByRole('heading', { level: 1 })).toContainText('TEST Atelier Interface')
    await page.goto('/sites')
    await page.screenshot({ path: testInfo.outputPath('demos-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/sites/${websiteId}`)
    await page.getByRole('button', { name: 'Mobile', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
    await page.getByRole('button', { name: 'Préparer l’email', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('email-mobile.png') })
    expect(await page.evaluate(() => document.querySelector('[role=dialog]')!.scrollWidth)).toBeLessThanOrEqual(360)
  } finally {
    await page.request.put('/api/settings', { data: { ai: { provider: 'none' } } })
    if (businessId) await db`delete from businesses where id=${businessId}`
    await db.end()
  }
})
