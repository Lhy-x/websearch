import {expect,test} from '@playwright/test'
import {createServer} from 'node:http'
import {once} from 'node:events'
import postgres from 'postgres'

test('search and manual enrichment expose distinct sourced recaps, update live and remain usable on mobile',async({page},testInfo)=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(/hydrated|hydration|didn't match/.test(message.text()))errors.push(message.text())})
 const server=createServer((_req,res)=>{
  res.setHeader('Content-Type','application/json')
  res.end(JSON.stringify({elements:[
   {type:'node',id:701,lat:49.44,lon:1.09,tags:{name:'TEST Atelier Rivage',shop:'hairdresser','addr:city':'Rouen','addr:country':'FR',description:'Notre atelier restaure les sièges anciens et fabrique des meubles en chêne.',delivery:'yes'}},
   {type:'node',id:702,lat:49.45,lon:1.1,tags:{name:'TEST Jardin Camélia',shop:'hairdresser','addr:city':'Rouen','addr:country':'FR',description:'Notre pépinière cultive des plantes vivaces et conseille les jardiniers.',wheelchair:'yes'}},
  ]}))
 })
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const db=postgres(process.env.E2E_DATABASE_URL??'postgres://pf:pf@localhost:5432/prospectforge_e2e')
 const names=['TEST Atelier Rivage','TEST Jardin Camélia']
 try{
  const denied=await page.request.get('/api/prospects/00000000-0000-0000-0000-000000000000/summary')
  expect(denied.status()).toBe(401)
  expect((await page.request.post('/api/auth/login',{data:{email:'admin@e2e.local',password:'e2e-password-123'}})).ok()).toBeTruthy()
  expect((await page.request.put('/api/settings',{data:{ai:{provider:'none'},search:{sources:{overture:false,recherche_entreprises:false,osm:true,google_places:false}},runtime:{OVERPASS_URL:`http://127.0.0.1:${(server.address() as {port:number}).port}`}}})).ok()).toBeTruthy()
  await page.goto('/search')
  await page.getByText('Région, département, coordonnées…').click()
  await page.getByLabel('Latitude',{exact:true}).fill('49.44')
  await page.getByLabel('Longitude',{exact:true}).fill('1.09')
  await page.getByLabel('Présence web').selectOption('any')
  await page.getByRole('button',{name:'Lancer la recherche',exact:true}).click()
  await expect(page.getByText(/2 prospect\(s\) correspondant aux filtres/)).toBeVisible({timeout:60000})
  const first=page.getByRole('row').filter({has:page.getByRole('link',{name:names[0],exact:true})})
  const second=page.getByRole('row').filter({has:page.getByRole('link',{name:names[1],exact:true})})
  await expect(first.getByText(/restaure les sièges/)).toBeVisible()
  await expect(first.getByText(/Livraison indiquée/)).toBeVisible()
  await expect(second.getByText(/cultive des plantes vivaces/)).toBeVisible()
  await expect(second.getByText(/Accès fauteuil roulant indiqué/)).toBeVisible()
  await expect(first.getByText(/plantes vivaces/)).toHaveCount(0)
  await expect(page.getByText(/2 · \+2/)).toBeVisible()
  const runId=new URL(page.url()).searchParams.get('run')!
  await expect.poll(async()=>{const info=await(await page.request.get(`/api/search/runs/${runId}`)).json();return info.enrichment.active},{timeout:60000}).toBe(0)
  await page.screenshot({path:testInfo.outputPath('search-recaps.png'),fullPage:true})
  await first.getByRole('link',{name:'Voir le récapitulatif'}).click()
  await expect(page).toHaveURL(/\/prospects\/[0-9a-f-]{36}#recap$/)
  const id=new URL(page.url()).pathname.split('/').pop()!
  const card=page.locator('#recap')
  await expect(card.getByRole('heading',{name:'Ce qu’ils font'})).toBeVisible()
  await expect(card.getByText('Livraison indiquée',{exact:true})).toBeVisible()
  await card.getByText('Voir les extraits et leurs sources').click()
  await expect(card.getByRole('link',{name:'Indication OpenStreetMap à confirmer'})).toHaveAttribute('href','https://www.openstreetmap.org/node/701')
  await db`update business_sources set raw='{"description":"Notre atelier conçoit des luminaires en bois et restaure les sièges anciens.","capabilities":{"delivery":"no","wheelchair":"yes"}}',fetched_at=now() where business_id=${id} and source='osm'`
  await card.getByRole('button',{name:'Enrichir l’activité et les avantages'}).click()
  await expect(card.getByText(/conçoit des luminaires/).first()).toBeVisible({timeout:60000})
  await expect(card.getByText('Accès fauteuil roulant indiqué',{exact:true})).toBeVisible()
  await expect(card.getByText('Livraison indiquée',{exact:true})).toHaveCount(0)
  const recap=await(await page.request.get(`/api/prospects/${id}/summary`)).json()
  expect(recap.summary.activity.text).toContain('luminaires')
  await page.setViewportSize({width:360,height:800})
  await expect(card.getByRole('button',{name:'Enrichir l’activité et les avantages'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(362)
  await page.screenshot({path:testInfo.outputPath('prospect-recap-mobile.png'),fullPage:true})
  await page.goto(`/search?run=${runId}`)
  await expect(page.getByRole('row').filter({has:page.getByRole('link',{name:names[0],exact:true})}).getByText(/conçoit des luminaires/)).toBeVisible()
  expect(errors).toEqual([])
 }finally{
  await db`delete from businesses where name=any(${names})`
  await db.end()
  server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
 }
})
