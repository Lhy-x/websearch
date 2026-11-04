import {afterAll,beforeEach,expect,it} from 'vitest'
import {randomUUID} from 'node:crypto'
import {resetDb,insertTestBusiness} from './helpers'
import {sql,closeDb} from '@/server/core/db'
import {createGenerationBatch,generationBatch,changeGenerationBatch} from '@/server/sites/batches'
import {loadBusinessFacts} from '@/server/sites/facts'
import {workspaceProgress} from '@/server/analytics/progress'
import {generateWebsite} from '@/server/sites/service'
beforeEach(resetDb)
afterAll(closeDb)

it('queues all 205 prospects atomically, pages every row and reuses an acknowledged or overlapping request',async()=>{
 const rows=await sql()< {id:string}[]>`insert into businesses(name,normalized_name,country,tags) select 'TEST Lot '||n,'test lot '||n,'FR','{test-data}' from generate_series(1,205) n returning id`
 const ids=rows.map(row=>row.id),requestId=randomUUID()
 const batch=await createGenerationBatch(ids,{requestId,generator:'deterministic'})
 expect(batch.queued).toBe(205)
 expect((await createGenerationBatch(ids,{requestId,generator:'deterministic'})).batchId).toBe(batch.batchId)
 const pages=await Promise.all([1,2,3,4,5,6].map(page=>generationBatch(batch.batchId,page)))
 expect(pages[0]!.summary).toMatchObject({total:205,pending:205})
 expect(new Set(pages.flatMap(page=>page.items.map(row=>row.business_id))).size).toBe(205)
 const overlap=await createGenerationBatch(ids.slice(0,3),{generator:'deterministic'})
 expect((await generationBatch(overlap.batchId)).items.every(row=>row.reused)).toBe(true)
 expect((await sql()`select id from automation_jobs`)).toHaveLength(205)
})
it('reports excluded prospects and scopes cancellation/retry to the selected batch',async()=>{
 const first=await insertTestBusiness(),blocked=await insertTestBusiness({name:'TEST Opposition'}),outside=await insertTestBusiness({name:'TEST Autre'})
 await sql()`update businesses set do_not_contact=true where id=${blocked}`
 const batch=await createGenerationBatch([first,blocked,randomUUID()],{generator:'deterministic'})
 const other=await createGenerationBatch([outside],{generator:'deterministic'})
 expect(batch.skipped).toHaveLength(2)
 expect((await changeGenerationBatch(batch.batchId,'cancel_pending')).updated).toBe(1)
 expect((await generationBatch(other.batchId)).summary!.pending).toBe(1)
 expect((await changeGenerationBatch(batch.batchId,'retry')).updated).toBe(1)
 expect((await generationBatch(batch.batchId)).summary!.pending).toBe(1)
})
it('feeds public verified details to creation while excluding private CRM notes and unverified enrichments',async()=>{
 const id=await insertTestBusiness()
 await sql()`insert into crm_notes(business_id,body) values(${id},'PRIVATE CRM DO NOT PUBLISH')`
 await sql()`insert into business_enrichments(business_id,field,value,source) values(${id},'site_brief','{"publicDetails":"Coloration végétale sur rendez-vous","artDirection":"Éditorial botanique"}','manual'),(${id},'unverified','{"claim":"SECRET UNVERIFIED"}','crawler')`
 const facts=await loadBusinessFacts(id)
 expect(facts.publicDetails).toContain('végétale');expect(facts.artDirection).toContain('botanique')
 expect(JSON.stringify(facts)).not.toMatch(/PRIVATE CRM|SECRET UNVERIFIED/)
})
it('awards milestones once for actual creations and never treats a test purchase as a real sale',async()=>{
 const id=await insertTestBusiness()
 const site=await generateWebsite(id,{generator:'deterministic'})
 const first=await workspaceProgress(),second=await workspaceProgress()
 expect(first.xp).toBe(second.xp)
 expect(first.missions.find(row=>row.code==='first_site')?.done).toBe(true)
 await generateWebsite(id,{generator:'deterministic'})
 expect((await workspaceProgress()).missions.find(row=>row.code==='three_sites')?.current).toBe(1)
 const [version]=await sql()`select config from website_versions where website_id=${site.websiteId} order by version desc limit 1`
 await sql()`insert into website_orders(website_id,business_id,business_name,version,snapshot,amount_cents,currency,livemode,status,access_token) values(${site.websiteId},${id},'TEST',1,${sql().json(version!.config)},100,'eur',false,'PAID',${randomUUID()+randomUUID()})`
 const result=await workspaceProgress()
 expect(result.missions.find(row=>row.code==='test_purchase')?.done).toBe(true)
 expect(result.missions.find(row=>row.code==='first_sale')?.done).toBe(false)
})
