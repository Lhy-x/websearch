import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest'
import {createServer,type Server} from 'node:http'
import {once} from 'node:events'
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {sql,closeDb} from '@/server/core/db'
import {resetDb,insertTestBusiness} from './helpers'
import {getBusinessSummary,refreshBusinessSummary} from '@/server/enrich/summary'
import {enrichBusiness} from '@/server/enrich/crawl'
import {persistCluster} from '@/server/search/run-search'
import {mapOsm} from '@/server/connectors/osm'
import {listBusinesses,listFiltersSchema} from '@/server/business/queries'
import {loadBusinessFacts} from '@/server/sites/facts'
import {buildBespokePrompt} from '@/server/sites/bespoke/prompt'
import {directionFacts} from '@/server/sites/bespoke/direction'
import {enqueueJob,claimJob} from '@/server/jobs/queue'
import {executeJob} from '@/server/jobs/runner'
import {updateSettings} from '@/server/core/settings'
import {resetEnvCache} from '@/server/core/env'

let server:Server|undefined
const temporaryDirectories:string[]=[]
beforeEach(resetDb)
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();resetEnvCache();for(const dir of temporaryDirectories.splice(0))rmSync(dir,{recursive:true,force:true});if(server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));server=undefined}})
afterAll(closeDb)

const osm=()=>mapOsm({type:'node',id:42,lat:49.44,lon:1.09,tags:{name:'TEST Atelier Rivage',shop:'hairdresser','addr:city':'Rouen','addr:country':'FR',description:'Notre atelier restaure les sièges anciens et fabrique des meubles en chêne.',delivery:'no',wheelchair:'yes'}} ,null)!

it('persists an immediate sourced recap on search, refreshes existing records and never invents OSM benefits',async()=>{
 const source=osm(),first=await persistCluster([source])
 const summary=(await getBusinessSummary(first.id))!
 expect(summary.activity.text).toContain('sièges anciens')
 expect(summary.advantages.map(item=>item.text)).toEqual(['Accès fauteuil roulant indiqué'])
 expect(summary.advantages[0]!.evidence[0]!.url).toBe('https://www.openstreetmap.org/node/42')
 const changed=await persistCluster([{...source,raw:{description:'Notre atelier conçoit uniquement des luminaires en bois.',capabilities:{delivery:'yes',wheelchair:'no'}}}])
 expect(changed.id).toBe(first.id)
 expect(changed.created).toBe(false)
 const updated=(await getBusinessSummary(first.id))!
 expect(updated.activity.text).toContain('luminaires')
 expect(updated.advantages.map(item=>item.text)).toEqual(['Livraison indiquée'])
 expect(updated.sourceHash).not.toBe(summary.sourceHash)
 expect(await sql()`select 1 from business_enrichments where field='business_summary'`).toHaveLength(1)
})

it('the actual enrichment reads service and engagement pages, updates the recap and passes its sources into site creation',async()=>{
 const visited:string[]=[]
 let benefit='Chaque meuble est réalisé sur mesure dans notre atelier.'
 server=createServer((req,res)=>{
  visited.push(req.url!);res.setHeader('Content-Type','text/html')
  res.end(req.url==='/services'?'<title>Savoir-faire</title><section><h2>Notre activité</h2><p>Notre atelier fabrique des meubles en chêne et restaure les sièges anciens.</p></section>':req.url==='/engagements'?`<title>Engagements</title><section><h2>Nos avantages</h2><p>${benefit}</p></section>`:'<title>Atelier Rivage</title><nav><a href="/services">Prestations</a><a href="/engagements">Engagements</a></nav><p>Bienvenue dans notre atelier situé à Rouen.</p>')
 })
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`
 const id=await insertTestBusiness({name:'TEST Atelier Rivage',email:null})
 await sql()`update businesses set website_url=${base} where id=${id}`
 await sql()`insert into business_contacts(business_id,kind,value,normalized_value,source,status) values(${id},'website',${base},${base},'manual','SOURCE_CONFIRMED')`
 await sql()`insert into crm_notes(business_id,body) values(${id},'PRIVATE CRM DO NOT PUBLISH')`
 const result=await enrichBusiness(id,{allowPrivate:true})
 expect(visited).toEqual(expect.arrayContaining(['/','/services','/engagements']))
 expect(result.summary.activity.text).toContain('sièges anciens')
 expect(result.summary.advantages.map(item=>item.text)).toContain(benefit)
 expect(result.summary.advantages[0]!.evidence[0]!.url).toBe(base+'/engagements')
 const facts=await loadBusinessFacts(id)
 expect(facts.publicRecap?.sourceHash).toBe(result.summary.sourceHash)
 expect(facts.verifiedDetails?.map(item=>item.field)).not.toContain('website_content')
 expect(buildBespokePrompt(facts,{})).toContain(benefit)
 expect(directionFacts(facts)['recap.advantage.0']).toBe(benefit)
 expect(JSON.stringify(facts)).not.toContain('PRIVATE CRM')
 benefit='Nous ne proposons pas de livraison.'
 const refreshed=await enrichBusiness(id,{allowPrivate:true})
 expect(refreshed.summary.advantages).toEqual([])
 expect(JSON.stringify(refreshed.summary)).not.toContain('sur mesure')
})

it('works without AI, remains stable on unchanged sources and distinguishes a missing detailed description',async()=>{
 const id=await insertTestBusiness({email:null})
 const limited=await refreshBusinessSummary(id,{allowAi:true})
 expect(limited.coverage).toBe('limited');expect(limited.advantages).toEqual([])
 await sql()`insert into business_enrichments(business_id,field,value,source) values(${id},'site_brief','{"publicDetails":"Notre salon propose des colorations végétales sur rendez-vous.\\nLes soins sont personnalisés après un diagnostic."}','manual')`
 const publicBrief=await refreshBusinessSummary(id,{allowAi:true})
 expect(publicBrief.activity.text).toContain('colorations végétales')
 expect(publicBrief.advantages[0]!.text).toContain('personnalisés')
 expect(publicBrief.activity.evidence[0]!.kind).toBe('manual')
 expect(await refreshBusinessSummary(id,{allowAi:true})).toEqual(publicBrief)
 expect(await sql()`select * from api_usage`).toHaveLength(0)
})

it('search enqueues background enrichment for existing prospects too, and listing reports only their active jobs',async()=>{
 const source=osm(),{id}=await persistCluster([source])
 await updateSettings({search:{sources:{osm:true}},runtime:{OVERPASS_URL:'https://summary-overpass.test/api'}})
 const real=globalThis.fetch
 vi.stubGlobal('fetch',async(url:string|URL,init?:RequestInit)=>String(url)==='https://summary-overpass.test/api'?new Response(JSON.stringify({elements:[{type:'node',id:42,lat:49.44,lon:1.09,tags:{name:source.name,shop:'hairdresser','addr:city':'Rouen','addr:country':'FR',description:'Notre atelier conçoit des meubles en bois et restaure les sièges anciens.',delivery:'yes'}}]}),{headers:{'Content-Type':'application/json'}}):real(url,init))
 const queued=await enqueueJob('search.run',{params:{lat:49.44,lon:1.09,radiusKm:10,sources:['osm'],country:'FR',maxResults:10}})
 const claimed=(await claimJob('summary-test'))!
 expect(claimed.id).toBe(queued.job.id)
 expect(await executeJob(claimed,'summary-test')).toBe('COMPLETED')
 const [run]=await sql()`select id,new_count,business_ids from search_runs`
 expect(run!.new_count).toBe(0);expect(run!.business_ids).toEqual([id])
 const [job]=await sql()`select id,payload from automation_jobs where type='business.enrich'`
 expect(job!.payload).toMatchObject({businessIds:[id],searchRunId:run!.id,aiSummary:false})
 let listed=await listBusinesses(listFiltersSchema.parse({ids:id}))
 expect(listed.rows[0]!.enriching).toBe(true)
 expect(listed.rows[0]!.summary?.advantages[0]!.text).toBe('Livraison indiquée')
 await sql()`update automation_jobs set status='COMPLETED' where id=${job!.id}`
 listed=await listBusinesses(listFiltersSchema.parse({ids:id}))
 expect(listed.rows[0]!.enriching).toBe(false)
})

it('uses a configured AI selector once, discards invented excerpts and keeps working when the call quota is reached',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'summary-ai-'));temporaryDirectories.push(dir)
 vi.stubEnv('FAKE_CLI_DIR',dir)
 vi.stubEnv('CLAUDE_CLI_PATH',path.resolve('tests/fixtures/fake-claude'))
 resetEnvCache()
 await updateSettings({ai:{provider:'claude-code',subscriptionDailyCalls:1}})
 const id=await insertTestBusiness({email:null})
 const text='Notre atelier fabrique des meubles en chêne et restaure les sièges anciens.'
 await sql()`insert into business_enrichments(business_id,field,value,source) values(${id},'site_brief',${sql().json({publicDetails:text})},'manual')`
 writeFileSync(path.join(dir,'response-default.json'),JSON.stringify({activity:[{sourceId:'s1',excerpt:text}],advantages:[{sourceId:'s1',excerpt:'Une garantie de satisfaction totale'}]}))
 expect((await enrichBusiness(id,{allowAi:false})).summary.method).toBe('sources')
 expect(await sql()`select * from api_usage`).toHaveLength(0)
 const summary=await refreshBusinessSummary(id,{allowAi:true})
 expect(summary.method).toBe('ai_selection')
 expect(summary.advantages).toEqual([])
 expect(await refreshBusinessSummary(id,{allowAi:true})).toEqual(summary)
 expect(readFileSync(path.join(dir,'counter'),'utf8')).toBe('1')
 await sql()`update business_enrichments set value='{"publicDetails":"Notre atelier fabrique des meubles en chêne.\\nLivraison locale sur rendez-vous."}',retrieved_at=now() where business_id=${id} and field='site_brief'`
 const limited=await refreshBusinessSummary(id,{allowAi:true})
 expect(limited.method).toBe('sources')
 expect(limited.advantages[0]!.text).toBe('Livraison locale sur rendez-vous.')
 expect(readFileSync(path.join(dir,'counter'),'utf8')).toBe('1')
 expect(await sql()`select * from api_usage where operation='business_summary'`).toHaveLength(1)
})
