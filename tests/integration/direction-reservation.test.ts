import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {resetDb,insertTestBusiness} from './helpers'
import {sql,closeDb} from '@/server/core/db'
import {updateSettings} from '@/server/core/settings'
import {loadBusinessFacts} from '@/server/sites/facts'
import {reserveArtDirection,conceptsTooClose} from '@/server/sites/bespoke/direction'
let directory:string
beforeEach(async()=>{
 await resetDb();directory=await mkdtemp(path.join(tmpdir(),'pf-directions-'))
 vi.stubEnv('FAKE_CLI_DIR',directory);vi.stubEnv('FAKE_CLI_LOG',path.join(directory,'calls'))
 vi.stubEnv('CLAUDE_CLI_PATH',path.resolve('tests/fixtures/fake-claude'))
 await updateSettings({ai:{provider:'claude-code'}})
})
afterEach(async()=>{vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true})})
afterAll(closeDb)
it('reserves different identities for two prospects generated concurrently, including sibling directions in the prompt',async()=>{
 const first=await insertTestBusiness({name:'TEST Atelier Plantes'}),second=await insertTestBusiness({name:'TEST Garage Technique'})
 const websites=await sql()< {id:string;business_id:string}[]>`insert into generated_websites(business_id,template_id,style,status,preview_token,generator) values(${first},'sur-mesure','sur mesure','GENERATING',${randomUUID()},'ai:test'),(${second},'sur-mesure','sur mesure','GENERATING',${randomUUID()},'ai:test') returning id,business_id`
 const results=await Promise.all(websites.map(async website=>reserveArtDirection(await loadBusinessFacts(website.business_id),website.id,{customInstructions:''})))
 expect(conceptsTooClose(results[0]!.direction.concept,results[1]!.direction.concept)).toBe(false)
 const saved=await sql()`select creative_brief->'artDirection' direction from generated_websites order by id`
 expect(saved.every(row=>row.direction?.version===2)).toBe(true)
 expect(new Set(saved.map(row=>row.direction.concept.name)).size).toBe(2)
 const calls=(await readFile(path.join(directory,'calls'),'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line))
 expect(calls.some(call=>call.stdin.includes('Créations voisines à distinguer : [{'))).toBe(true)
 expect(calls.every(call=>call.phase==='direction')).toBe(true)
})
