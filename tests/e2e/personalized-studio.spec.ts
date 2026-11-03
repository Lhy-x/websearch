import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

test.use({launchOptions:{...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']}})

test('studio design, extension-decorated login, AI-required state and responsive layout',async({page},testInfo)=>{
  const hydration:string[]=[]
  page.on('console',message=>{if(/hydrated|hydration|didn't match/.test(message.text()))hydration.push(message.text())})
  await page.addInitScript(()=>{const add=()=>{if(document.body){document.body.classList.add('mci-test-extension');return true}return false};if(!add()){const observer=new MutationObserver(()=>{if(add())observer.disconnect()});observer.observe(document.documentElement??document,{childList:true,subtree:true})}})
  await page.goto('/login')
  await expect(page.getByRole('button',{name:'Se connecter'})).toBeVisible()
  await page.screenshot({path:testInfo.outputPath('login-desktop.png')})
  expect((await page.request.post('/api/auth/login',{data:{email:'admin@e2e.local',password:'e2e-password-123'}})).ok()).toBeTruthy()
  await page.request.put('/api/settings',{data:{ai:{provider:'none'}}})
  await page.goto('/generator')
  await expect(page.getByRole('link',{name:'Connecter mon IA'})).toBeVisible()
  expect(await page.locator('select').count()).toBe(0)
  await page.screenshot({path:testInfo.outputPath('studio-desktop.png')})
  await page.setViewportSize({width:390,height:844})
  await expect(page.getByRole('link',{name:'Connecter mon IA'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(392)
  await page.screenshot({path:testInfo.outputPath('studio-mobile.png'),fullPage:true})
  expect(hydration).toEqual([])
})

test('one click creates an AI-authored site using the uploaded skill and embeds its original 3D silhouette',async({page},testInfo)=>{
  test.skip(!process.env.FAKE_CLI_DIR,'Configure the test-double directory and CLAUDE_CLI_PATH on the Playwright web/worker processes.')
  const dir=process.env.FAKE_CLI_DIR!
  const html=readFileSync('tests/fixtures/bespoke-site.html','utf8').replace('</body>','<div data-glass-scene style="height:420px"></div></body>')
  writeFileSync(path.join(dir,'response-default.json'),JSON.stringify({designPlan:{concept:'Test sur mesure',palette:[{name:'Encre',hex:'#172138'}],typography:'Georgia',layout:'Composition originale',signature:'Verre facetté',revisions:'Vérifié'},html,glassScene:{silhouette:'<svg viewBox="0 0 100 100"><path d="M 50 4 L 96 50 L 50 96 L 4 50 Z"/></svg>',palette:['#172138','#b7ccff','#705bed'],description:'Sculpture originale inspirée du métier'}}))
  const db=postgres(process.env.E2E_DATABASE_URL??'postgres://pf:pf@localhost:5432/prospectforge_e2e')
  let id:string|undefined
  try {
    const [b]=await db<{id:string}[]>`insert into businesses(name,normalized_name,sector,city,country,phone,score,pipeline_status,tags) values('TEST Salon Lumière','test salon lumiere','hair_salon','Rouen','FR','+33235111111',70,'QUALIFIED','{test-data}') returning id`
    id=b!.id
    await db`insert into business_contacts(business_id,kind,value,normalized_value,source,status) values(${id},'email','contact@salon-lumiere.test','contact@salon-lumiere.test','manual','SOURCE_CONFIRMED')`
    await db`update businesses set email='contact@salon-lumiere.test',email_status='SOURCE_CONFIRMED' where id=${id}`
    await page.request.post('/api/auth/login',{data:{email:'admin@e2e.local',password:'e2e-password-123'}})
    await page.request.put('/api/settings',{data:{ai:{provider:'claude-code',costMode:'HIGH_QUALITY'},sites:{qualityPasses:0,visualReview:false}}})
    await page.goto(`/generator?business=${id}`)
    await expect(page.getByRole('button',{name:'Créer le site sur mesure',exact:true})).toBeEnabled()
    await page.getByRole('button',{name:'Créer le site sur mesure',exact:true}).click()
    let job:{status:string;error?:string;result:{websiteId:string}}
    await expect.poll(async()=>{const rows=await db<{status:string;error:string;result:{websiteId:string}}[]>`select status,error,result from automation_jobs where type='website.generate' and payload->>'businessId'=${id!} order by created_at desc limit 1`;job=rows[0]!;return job?.status},{timeout:90000}).toBe('COMPLETED')
    const [site]=await db<{preview_token:string;generator:string}[]>`select preview_token,generator from generated_websites where id=${job!.result.websiteId}`
    expect(site!.generator).toContain('personnalise-skill')
    const response=await page.goto(`/preview/${site!.preview_token}`)
    expect(response!.headers()['content-security-policy']).toContain('sandbox allow-scripts')
    await page.waitForFunction(()=>document.documentElement.dataset.glassState==='ready',undefined,{timeout:30000})
    expect(await page.locator('[data-glass-scene] canvas').count()).toBe(1)
    expect(await page.locator('.cinematic-container').count()).toBe(0)
    await page.screenshot({path:testInfo.outputPath('custom-site.png')})
    const exported=await page.request.post(`/api/sites/${job!.result.websiteId}`,{data:{action:'export'}})
    expect(exported.ok()).toBeTruthy()
    expect((await exported.body()).length).toBeGreaterThan(100000)
  } finally {if(id)await db`delete from businesses where id=${id}`;await db.end()}
})
