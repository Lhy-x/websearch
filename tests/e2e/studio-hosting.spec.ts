import {test,expect} from '@playwright/test'
import postgres from 'postgres'
import Stripe from 'stripe'
import {randomBytes,randomUUID} from 'node:crypto'

test('all batch rows remain visible, progress is real, and a paid customer can subscribe, publish and connect a domain in test mode',async({page,request},testInfo)=>{
 const db=postgres(process.env.E2E_DATABASE_URL??'postgres://pf:pf@localhost:5432/prospectforge_e2e')
 const ids:string[]=[],token=randomBytes(32).toString('base64url'),secret='whsec_e2e_host_fixture'
 try{
  expect((await page.request.post('/api/auth/login',{data:{email:'admin@e2e.local',password:'e2e-password-123'}})).ok()).toBeTruthy()
  // Pause while inspecting a lot larger than one page; no remote AI is used in this queue test.
  await db`update admin_settings set global_pause=true`
  const rows=await db<{id:string}[]>`insert into businesses(name,normalized_name,sector,city,country,tags) select 'TEST Suivi '||n,'test suivi '||n,'hair_salon','Rouen','FR','{test-data}' from generate_series(1,41) n returning id`
  ids.push(...rows.map(row=>row.id))
  const queued=await page.request.post('/api/prospects/bulk',{data:{ids,action:'generate_site',generator:'deterministic',requestId:randomUUID()}})
  expect(queued.ok()).toBeTruthy();const {batchId}=await queued.json()
  await page.goto(`/generator?batch=${batchId}`)
  await expect(page.getByRole('heading',{name:'Votre lot de créations'})).toBeVisible()
  await expect(page.getByText('41 prospect(s) enregistré(s) sur 41 sélectionné(s).',{exact:false})).toBeVisible()
  await expect(page.locator('#creation-batch').getByText('TEST Suivi 40',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Page suivante du lot'}).click()
  await expect(page.locator('#creation-batch').getByText('TEST Suivi 41',{exact:true})).toBeVisible()
  await page.reload();await expect(page.getByRole('progressbar',{name:'Sites prêts dans ce lot'})).toHaveAttribute('max','41')
  if(process.env.FAKE_CLI_DIR){
   await page.request.put('/api/settings',{data:{ai:{provider:'claude-code'}}})
   await page.goto('/prospects')
   await page.getByRole('checkbox',{name:'Sélectionner TEST Suivi 1',exact:true}).check()
   await page.getByRole('checkbox',{name:'Sélectionner TEST Suivi 2',exact:true}).check()
   await page.getByRole('button',{name:'Créer les sites sur mesure',exact:true}).click()
   await expect(page).toHaveURL(/generator\?batch=/)
   await expect(page.getByText('2 prospect(s) enregistré(s) sur 2 sélectionné(s).',{exact:false})).toBeVisible()
   await expect(page.locator('#creation-batch').getByText('TEST Suivi 1',{exact:true})).toBeVisible()
   await expect(page.locator('#creation-batch').getByText('TEST Suivi 2',{exact:true})).toBeVisible()
  }
  // Keep one row to execute and cancel the remaining queued work through the public admin API.
  const [kept]=await db<{job_id:string}[]>`select job_id from generation_batch_items where batch_id=${batchId} order by position limit 1`
  await db`update automation_jobs set status='CANCELLED',finished_at=now() where type='website.generate' and payload->>'batchId'=${batchId} and id<>${kept!.job_id}`
  await db`update admin_settings set global_pause=false`
  await expect.poll(async()=>(await db`select status from automation_jobs where id=${kept!.job_id}`)[0]?.status,{timeout:90000}).toBe('COMPLETED')
  const [generated]=await db`select w.id,w.business_id,w.current_version,v.config from automation_jobs j join generated_websites w on w.id::text=j.result->>'websiteId' join website_versions v on v.website_id=w.id and v.version=w.current_version where j.id=${kept!.job_id}`
  await page.goto('/');await page.getByRole('button',{name:/Votre progression : niveau/}).click()
  await expect(page.getByRole('dialog').getByText('Votre première création',{exact:true})).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/settings?tab=hosting')
  await page.getByRole('spinbutton',{name:'Abonnement mensuel',exact:true}).fill('29')
  await page.getByRole('checkbox',{name:'Proposer l’abonnement après paiement'}).check()
  await page.getByRole('button',{name:'Enregistrer l’hébergement',exact:true}).click()
  await expect(page.getByText('Offre d’hébergement enregistrée',{exact:true})).toBeVisible()
  expect((await page.request.post('/api/billing/credentials',{data:{mode:'test',key:'sk_test_e2e_host_only',webhook:secret}})).ok()).toBeTruthy()
  const [order]=await db<{id:string}[]>`insert into website_orders(website_id,business_id,business_name,version,snapshot,amount_cents,currency,livemode,status,access_token) values(${generated!.id},${generated!.business_id},'TEST Espace Client',${generated!.current_version},${db.json(generated!.config)},19900,'eur',false,'PAID',${token}) returning id`
  await page.setViewportSize({width:360,height:800})
  await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Stripe test hors ligne</h1>'}))
  await page.goto(`/purchase/${token}`)
  await expect(page.getByRole('heading',{name:'Paiement confirmé'})).toBeVisible()
  await page.getByRole('button',{name:'M’abonner et mettre en ligne',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Stripe test hors ligne'})).toBeVisible()
  const [hosting]=await db`select checkout_attempt from website_hosting where order_id=${order!.id}`
  const event={id:'evt_e2e_host_'+randomUUID(),type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_fixture_host_1',subscription:'sub_fixture_1',metadata:{hosting_order_id:order!.id,hosting_attempt:hosting!.checkout_attempt}}}}
  const body=JSON.stringify(event)
  const response=await request.post('/api/webhooks/stripe',{data:body,headers:{'content-type':'application/json','stripe-signature':Stripe.webhooks.generateTestHeaderString({payload:body,secret})}})
  expect(await response.text()).toContain('true');expect(response.ok()).toBeTruthy()
  await page.goto(`/purchase/${token}`)
  await expect(page.getByRole('link',{name:'Voir la publication simulée'})).toBeVisible({timeout:60000})
  await page.getByRole('textbox',{name:'Mon nom de domaine',exact:true}).fill('www.client-demo.fr')
  await page.getByRole('button',{name:'Connecter mon domaine',exact:true}).click()
  await expect(page.getByText('Vérification simulée',{exact:true})).toBeVisible()
  expect((await request.get(`/purchase/${token}/download`)).ok()).toBeTruthy()
  expect((await request.get(`/purchase/${token}/site`)).ok()).toBeTruthy()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(362)
  await page.screenshot({path:testInfo.outputPath('customer-mobile.png'),fullPage:true})
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:testInfo.outputPath('customer-desktop.png'),fullPage:true})
  await page.goto('/settings');await expect(page.getByRole('button',{name:'Désactiver le mode test et passer en production'})).toBeDisabled()
  await page.screenshot({path:testInfo.outputPath('launch-checklist.png'),fullPage:true})
 }finally{await db`update admin_settings set global_pause=false`;if(ids.length)await db`delete from businesses where id=any(${ids}::uuid[])`;await db.end()}
})
