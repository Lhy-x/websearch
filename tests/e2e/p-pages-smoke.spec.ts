import { expect, test } from '@playwright/test'

const PAGES: [string, RegExp][] = [
  ['/', /Faisons avancer vos projets/], ['/?period=7d', /Faisons avancer vos projets/], ['/search', /Recherche de prospects/], ['/prospects', /Mes prospects/],
  ['/qualification', /Qualification/], ['/generator', /Générateur de sites/], ['/sites', /Mes démos/], ['/campaigns', /Campagnes/],
  ['/campaigns/new', /Nouvelle campagne/], ['/inbox', /Boîte de réception/], ['/crm', /CRM/], ['/automations', /Automatisations/],
  ['/analytics', /Analytics/], ['/analytics?period=custom&from=2026-01-01&to=2026-12-31', /Analytics/], ['/settings', /Paramètres/], ['/settings?tab=ai',/Paramètres/], ['/settings?tab=payment',/Paramètres/], ['/sales',/Mes ventes/], ['/guide',/Un premier site/], ['/sites?trash=1',/Corbeille/], ['/assistant', /Assistant/],
]

test('every page renders without server or console errors (light and dark)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    // external tiles/fonts may be unreachable in CI sandboxes; app errors are what matter
    if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(`${page.url()} → ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`${page.url()} → ${e.message}`))
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@e2e.local')
  await page.getByLabel('Mot de passe').fill('e2e-password-123')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))

  const ids = (await (await page.request.get('/api/prospects?pageSize=10')).json()).rows.map((r: { id: string }) => r.id)
  const jobs = await (await page.request.get('/api/search/runs')).json()
  const extra: [string, RegExp][] = [...(ids[0] ? [[`/prospects/${ids[0]}`, /.+/] as [string, RegExp]] : [])]
  if (jobs[0]?.id) extra.push([`/search?run=${jobs[0].id}`, /Recherche de prospects/])
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' })
    const dark = (await page.locator('html').getAttribute('class'))?.includes('dark') ?? false
    if (dark !== (theme === 'dark')) await page.getByRole('button',{name:'Changer de thème'}).click()
    for (const [url, heading] of [...PAGES, ...extra]) {
      const res = await page.goto(url)
      expect(res?.status(), url).toBe(200)
      await expect(page.getByRole('heading', { level: 1 }).first(), url).toHaveText(heading)
      await expect(page.getByText(/Application error|Unhandled Runtime Error|This page couldn’t load/)).toHaveCount(0)
    }
  }
  expect(errors).toEqual([])
})
