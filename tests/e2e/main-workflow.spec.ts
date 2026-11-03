import { expect, test } from '@playwright/test'

/**
 * Reference scenario (§19): login → real search (Overture) → prospects saved & scored → generate a site →
 * public preview → edit → proposal → campaign → send via provider (sandbox) → reply → inbox + CRM updated,
 * follow-ups stopped.
 * Requires network access to the public Overture S3 bucket.
 */
test('reference workflow end-to-end', async ({ page, request, baseURL }) => {
  // 1. Login (and a wrong password is refused)
  await page.goto('/campaigns')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Email').fill('admin@e2e.local')
  await page.getByLabel('Mot de passe').fill('wrong-password')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByText('Identifiants incorrects')).toBeVisible()
  await page.getByLabel('Mot de passe').fill('e2e-password-123')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/campaigns/)

  // configure the sender (Settings → Prospection) through the API used by the Settings page
  const s = await page.request.put('/api/settings', { data: { outreach: { senderName: 'E2E Sender', senderEmail: 'sender@e2e.test', signature: 'E2E Sender' } } })
  expect(s.ok()).toBeTruthy()

  // 2. Prospect Finder: France / Rouen / Coiffeur / 10 km / no known website
  await page.goto('/search')
  await page.getByPlaceholder('Rouen').fill('Rouen')
  await page.getByLabel('Secteur d’activité').selectOption('hair_salon')
  await page.getByLabel('Présence web').selectOption('no_website')
  // only Overture is reachable from CI sandboxes; Sirene is tried when available
  const sirene = page.getByLabel(/Sirene/)
  if (await sirene.isChecked()) await sirene.uncheck()
  await page.getByRole('button', { name: 'Lancer la recherche' }).click()
  await expect(page).toHaveURL(/run=/)
  await expect(page.getByText(/prospect\(s\) correspondant aux filtres/)).toBeVisible({ timeout: 240_000 })
  const firstProspect = page.locator('table a[href^="/prospects/"]').first()
  await expect(firstProspect).toBeVisible()
  const name = (await firstProspect.textContent())!.trim()
  await firstProspect.click()

  // 3. Prospect record: provenance + score
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  await expect(page.getByText('Vérification de la présence web')).toBeVisible()
  await expect(page.getByText(/overture/).first()).toBeVisible()
  const prospectUrl = page.url()
  const businessId = prospectUrl.split('/').pop()!

  // the prospect may have no email in the open data: add a clearly-marked TEST contact for the campaign step
  await page.request.post(`/api/prospects/${businessId}`, { data: { action: 'add_contact', kind: 'email', value: 'e2e-prospect@example.test' } })
  await page.request.post(`/api/prospects/${businessId}`, { data: { action: 'contact_status', contactId: (await (await page.request.get(`/api/prospects/${businessId}`)).json()).contacts.find((c: { normalized_value: string }) => c.normalized_value === 'e2e-prospect@example.test').id, primary: true } })

  // 4. Generate a site (deterministic: no AI key in E2E)
  await page.reload()
  // Legacy deterministic renderer is checked explicitly via API; the product UI now creates custom AI sites.
  const generation = await page.request.post(`/api/prospects/${businessId}`, { data: { action: 'generate_site', generator: 'deterministic' } })
  expect(generation.ok()).toBeTruthy()
  const { jobId: generationJob } = await generation.json()
  await expect.poll(async () => (await (await page.request.get(`/api/jobs/${generationJob}`)).json()).job.status, { timeout: 120_000 }).toBe('COMPLETED')
  await page.reload()
  await expect(page.getByRole('link', { name: 'Éditer' }).first()).toBeVisible()

  // 5. Public preview: works without session, noindex, demo banner
  const previewHref = await page.getByRole('link', { name: 'Prévisualiser' }).first().getAttribute('href')
  expect(previewHref).toMatch(/\/preview\/[A-Za-z0-9_-]{20,}/)
  const anon = await request.get(previewHref!.replace(/^https?:\/\/[^/]+/, baseURL!), { headers: { cookie: '' } })
  expect(anon.status()).toBe(200)
  expect(anon.headers()['x-robots-tag']).toContain('noindex')
  const html = await anon.text()
  expect(html).toContain('Démonstration non officielle')
  expect(html).not.toContain('<script')

  // 6. Edit the site → new version
  await page.getByRole('link', { name: 'Éditer' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: /Éditeur — v1/ })).toBeVisible()
  const subtitle = page.getByLabel('Sous-titre')
  await subtitle.fill('Un salon de quartier — texte modifié en E2E.')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText(/Version 2 enregistrée/)).toBeVisible()
  await expect(page.frameLocator('iframe[title="Aperçu du site"]').getByText('texte modifié en E2E')).toBeVisible()

  // 7. Proposal
  await page.goto(prospectUrl)
  await page.getByRole('button', { name: 'Créer une proposition' }).click()
  await expect(page.getByText('Proposition commerciale : terminé')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Objet :')).toBeVisible()
  await expect(page.locator('pre').filter({ hasText: '/preview/' }).first()).toBeVisible()

  // 8. Campaign (manual mode) with this prospect selected
  await page.goto('/prospects?ids=' + businessId)
  await page.getByLabel(`Sélectionner ${name}`).check()
  await page.goto('/campaigns/new')
  await page.getByPlaceholder('Coiffeurs Rouen — novembre').fill('E2E campagne')
  // open the whole week so the test does not depend on the current time
  for (const d of ['Sam', 'Dim']) await page.getByRole('button', { name: d, exact: true }).click()
  await page.locator('input[name="start"]').fill('00:00')
  await page.locator('input[name="end"]').fill('23:59')
  await page.getByRole('button', { name: 'Créer la campagne (brouillon)' }).click()
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}/)
  await page.getByRole('button', { name: 'Activer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Activer' }).click()
  await expect(page.getByText('Campagne activée')).toBeVisible()
  await page.getByRole('button', { name: 'Traiter maintenant' }).click()
  await expect(page.getByRole('button', { name: /Valider les 1 message/ })).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: /Valider les 1 message/ }).click()
  await page.getByRole('button', { name: 'Traiter maintenant' }).click()
  await expect(page.getByText('Envoyé', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/sandbox_[0-9a-f-]+/)).toBeVisible()

  // 9. A reply arrives (manual entry = same pipeline as IMAP/webhook)
  await page.goto('/inbox')
  await page.getByRole('button', { name: 'Saisir un email reçu' }).click()
  await page.getByRole('dialog').getByLabel('Expéditeur').fill('e2e-prospect@example.test')
  await page.getByRole('dialog').getByLabel('Objet').fill('Re: votre proposition')
  await page.getByRole('dialog').getByLabel('Message').fill('Bonjour, pourquoi pas, pouvez-vous me rappeler mardi ? On peut se voir au salon.')
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText(/Classé : Demande de RDV/)).toBeVisible()
  await expect(page.getByText('pouvez-vous me rappeler mardi').first()).toBeVisible()

  // 10. CRM updated & follow-ups stopped
  const d = await (await page.request.get(`/api/prospects/${businessId}`)).json()
  expect(d.business.pipeline_status).toBe('INTERESTED')
  expect(d.tasks.some((t: { title: string }) => /rendez-vous/i.test(t.title))).toBe(true)
  await page.goto(page.url().replace(/\/inbox.*/, '/campaigns'))
  await page.getByRole('link', { name: 'E2E campagne' }).click()
  await expect(page.getByText('REPLIED').first()).toBeVisible()
})
