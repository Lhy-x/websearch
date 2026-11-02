import { expect, test } from '@playwright/test'

test('assistant: read answers immediately, actions only after confirmation', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@e2e.local')
  await page.getByLabel('Mot de passe').fill('e2e-password-123')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))

  await page.goto('/assistant')
  await page.evaluate(() => localStorage.removeItem('pf-assistant-history'))
  await page.reload()
  // read: answered from the database (the main workflow left one conversation)
  await page.getByRole('button', { name: 'Quelles conversations nécessitent mon attention ?' }).click()
  await expect(page.getByText(/conversation\(s\) à traiter/)).toBeVisible()

  // action: previewed, not executed until confirmed
  const runsBefore = (await (await page.request.get('/api/search/runs')).json()).length
  await page.getByLabel('Votre demande').fill('Recherche les entreprises de nettoyage à Rouen sans site confirmé.')
  await page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(page.getByText(/Recherche « Entreprise de nettoyage » à Rouen/)).toBeVisible()
  expect((await (await page.request.get('/api/search/runs')).json()).length).toBe(runsBefore)
  await page.getByRole('button', { name: 'Exécuter' }).click()
  await expect(page.getByText('Recherche lancée par le worker.').first()).toBeVisible()
  await page.getByRole('link', { name: 'Suivre la recherche →' }).click()
  // executed by the real worker against Overture
  await expect(page.getByText(/prospect\(s\) correspondant aux filtres/)).toBeVisible({ timeout: 240_000 })
})
