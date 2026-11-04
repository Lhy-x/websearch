import {test,expect} from '@playwright/test'
import postgres from 'postgres'
import Stripe from 'stripe'
import {randomBytes} from 'node:crypto'

test('simple navigation, demo → email → signed payment → invoice/download → trash/restore',async({page,request,baseURL})=>{
 const db=postgres(process.env.E2E_DATABASE_URL??'postgres://pf:pf@localhost:5432/prospectforge_e2e')
 let businessId:string|undefined
 const token=randomBytes(32).toString('base64url');const secret='whsec_e2e_fake_only'
 try {
  const [b]=await db<{id:string}[]>`insert into businesses(name,normalized_name,sector,city,country,email,email_status,score,pipeline_status,tags) values('TEST Client Vente','test client vente','hair_salon','Rouen','FR','client@example.test','SOURCE_CONFIRMED',80,'QUALIFIED','{test-data}') returning id`;businessId=b!.id
  await db`insert into business_contacts(business_id,kind,value,normalized_value,source,status) values(${businessId},'email','client@example.test','client@example.test','manual','SOURCE_CONFIRMED')`
  await page.request.post('/api/auth/login',{data:{email:'admin@e2e.local',password:'e2e-password-123'}})
  await page.request.put('/api/settings',{data:{commerce:{enabled:true,priceCents:19900},sites:{previewBaseUrl:baseURL},ai:{provider:'none'}}})
  await page.request.post('/api/billing/credentials',{data:{mode:'test',key:'sk_test_fake_only',webhook:secret}})
  const g=await page.request.post(`/api/prospects/${businessId}`,{data:{action:'generate_site',generator:'deterministic'}});const {jobId}=await g.json()
  let job:{status:string;result:{websiteId:string}}
  await expect.poll(async()=>{job=(await(await page.request.get(`/api/jobs/${jobId}`)).json()).job;return job.status},{timeout:90000}).toBe('COMPLETED')
  const id=job!.result.websiteId
  const [site]=await db<{preview_token:string;business_id:string;current_version:number}[]>`select preview_token,business_id,current_version from generated_websites where id=${id}`
  const [version]=await db`select config from website_versions where website_id=${id} and version=${site!.current_version}`
  await page.goto('/');await expect(page.getByRole('navigation',{name:'Navigation principale'}).getByRole('link')).toHaveCount(5)
  await page.goto('/sites')
  await page.getByRole('button',{name:'Préparer l’email'}).click();await page.getByRole('button',{name:'Rédiger mon email'}).click()
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue(new RegExp('/buy/'+site!.preview_token),{timeout:60000})
  await page.keyboard.press('Escape')
  const demo=await request.get(`/preview/${site!.preview_token}`);expect(await demo.text()).toContain('Commander ce site')
  await page.goto(`/buy/${site!.preview_token}`);await expect(page.getByRole('button',{name:'Payer avec Stripe'})).toBeVisible();await expect(page.getByText('Mode test : aucun paiement réel.')).toBeVisible()
  const [order]=await db<{id:string}[]>`insert into website_orders(website_id,business_id,business_name,version,snapshot,amount_cents,currency,livemode,status,access_token,stripe_session_id) values(${id},${businessId},'TEST Client Vente',${site!.current_version},${db.json(version!.config)},19900,'eur',false,'OPEN',${token},'cs_e2e') returning id`
  await page.goto(`/purchase/${token}?paid=true`);await expect(page.getByRole('link',{name:'Télécharger mon site'})).toHaveCount(0)
  expect((await request.get(`/purchase/${token}/download`)).status()).toBe(409)
  async function send(event:unknown){const body=JSON.stringify(event);return request.post('/api/webhooks/stripe',{data:body,headers:{'content-type':'application/json','stripe-signature':Stripe.webhooks.generateTestHeaderString({payload:body,secret})}})}
  const paid={id:'evt_e2e_paid',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_e2e',metadata:{order_id:order!.id},currency:'eur',amount_total:19900,payment_status:'paid',invoice:'in_e2e'}}}
  expect((await send(paid)).ok()).toBeTruthy();expect((await send(paid)).ok()).toBeTruthy()
  const invoice={id:'evt_e2e_invoice',type:'invoice.paid',livemode:false,data:{object:{id:'in_e2e',metadata:{order_id:order!.id},currency:'eur',total:19900,hosted_invoice_url:'https://invoice.stripe.com/i/e2e',invoice_pdf:'https://pay.stripe.com/invoice/e2e/pdf'}}}
  expect((await send(invoice)).ok()).toBeTruthy()
  await page.reload();await expect(page.getByRole('heading',{name:'Paiement confirmé'})).toBeVisible();await expect(page.getByRole('link',{name:'Consulter la facture Stripe'})).toBeVisible()
  expect((await request.get(`/purchase/${token}/download`)).ok()).toBeTruthy()
  await page.goto('/sales');await expect(page.getByText('Payé',{exact:true})).toBeVisible()
  await page.goto('/sites');await page.getByRole('button',{name:'Supprimer',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Placer dans la corbeille',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Supprimer',exact:true})).toHaveCount(0)
  expect((await request.get(`/preview/${site!.preview_token}`)).status()).toBe(404)
  expect((await request.get(`/purchase/${token}/download`)).ok()).toBeTruthy()
  await page.getByRole('link',{name:'Corbeille',exact:true}).click();await page.getByRole('button',{name:'Restaurer',exact:true}).click();await expect(page.getByRole('button',{name:'Restaurer',exact:true})).toHaveCount(0);expect((await request.get(`/preview/${site!.preview_token}`)).status()).toBe(200)
  await page.goto('/settings');await page.getByRole('tab',{name:'Paiement',exact:true}).click()
  await expect(page.getByRole('spinbutton',{name:/Prix unique/})).toHaveValue('199')
  await expect(page.getByText('Clés de test enregistrées',{exact:true})).toBeVisible()
  await page.getByRole('spinbutton',{name:/Prix unique/}).fill('249')
  await page.getByRole('button',{name:'Enregistrer le paiement',exact:true}).click()
  await expect(page.getByText('Paiement enregistré',{exact:true})).toBeVisible()
  await page.getByRole('tab',{name:'Mes emails',exact:true}).click()
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click()
  await expect(page.getByText('Paramètres enregistrés',{exact:true})).toBeVisible()
  expect((await(await page.request.get('/api/billing')).json()).commerce.priceCents).toBe(24900)
 }finally{if(businessId)await db`delete from businesses where id=${businessId}`;await db.end()}
})
