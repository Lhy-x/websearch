import {test,expect} from '@playwright/test'
import postgres from 'postgres'

test('a Stripe refusal stays on the order page, exposes a private redacted diagnostic and permits a safe retry',async({page,request,context,baseURL},testInfo)=>{
 const db=postgres(process.env.E2E_DATABASE_URL??'postgres://pf:pf@localhost:5432/prospectforge_e2e')
 let businessId:string|undefined
 try{
  const [business]=await db<{id:string}[]>`insert into businesses(name,normalized_name,sector,city,country,tags) values('TEST Paiement à reprendre','test paiement a reprendre','hair_salon','Rouen','FR','{test-data}') returning id`
  businessId=business!.id
  expect((await page.request.post('/api/auth/login',{data:{email:'admin@e2e.local',password:'e2e-password-123'}})).ok()).toBeTruthy()
  expect((await page.request.put('/api/settings',{data:{commerce:{enabled:true,priceCents:19900},sites:{previewBaseUrl:baseURL},ai:{provider:'none'}}})).ok()).toBeTruthy()
  expect((await page.request.post('/api/billing/credentials',{data:{mode:'test',key:'sk_test_e2e_checkout_only',webhook:'whsec_checkout_fixture_only'}})).ok()).toBeTruthy()
  const creation=await page.request.post(`/api/prospects/${businessId}`,{data:{action:'generate_site',generator:'deterministic'}})
  const {jobId}=await creation.json()
  let websiteId:string|undefined
  await expect.poll(async()=>{const {job}=await(await page.request.get(`/api/jobs/${jobId}`)).json();websiteId=job.result?.websiteId;return job.status},{timeout:90000}).toBe('COMPLETED')
  const [site]=await db<{preview_token:string}[]>`select preview_token from generated_websites where id=${websiteId!}`
  await page.setViewportSize({width:360,height:800})
  await page.goto(`/buy/${site!.preview_token}`)
  await page.getByRole('button',{name:'Payer avec Stripe',exact:true}).click()
  await expect(page.getByRole('alert').getByText(/Le profil professionnel Stripe doit être complété/)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/buy/${site!.preview_token}$`))
  expect(await page.locator('body').innerText()).not.toMatch(/sk_test_|buyer@example|private-fixture-token/)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(361)
  await page.screenshot({path:testInfo.outputPath('checkout-error-mobile.png'),fullPage:true})
  expect((await request.get('/api/billing')).status()).toBe(401)
  const admin=await context.newPage()
  await admin.goto('/settings?tab=payment')
  const diagnostic=admin.getByRole('region',{name:'Diagnostic du paiement Stripe'})
  await expect(diagnostic.getByText(/Le profil professionnel Stripe doit être complété/)).toBeVisible()
  await diagnostic.getByText('Voir le détail sécurisé de Stripe',{exact:true}).click()
  await expect(diagnostic.getByText(/Your business name must be set/)).toBeVisible()
  expect(await diagnostic.innerText()).not.toMatch(/sk_test_|buyer@example|private-fixture-token/)
  await expect(diagnostic.getByRole('button',{name:'Copier le diagnostic'})).toBeVisible()
  await admin.screenshot({path:testInfo.outputPath('private-stripe-diagnostic.png'),fullPage:true})
  await admin.close()
  await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Checkout de test ouvert</h1>'}))
  await page.getByRole('button',{name:'Réessayer le paiement',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Checkout de test ouvert'})).toBeVisible()
  const orders=await db`select status from website_orders where business_id=${businessId} order by created_at`
  expect(orders.map(row=>row.status)).toEqual(['FAILED','OPEN'])
  expect((await(await page.request.get('/api/billing')).json()).diagnostics.test).toBeNull()
 }finally{if(businessId)await db`delete from businesses where id=${businessId}`;await db.end()}
})
