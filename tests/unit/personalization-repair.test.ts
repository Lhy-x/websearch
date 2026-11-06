import {beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {runBespokePipeline} from '@/server/sites/bespoke/generate'
import {sanitizeSiteHtml} from '@/server/sites/bespoke/sanitize'
import type {BusinessFacts} from '@/lib/site/facts'
const model=vi.hoisted(()=>vi.fn())
vi.mock('@/server/ai/client',()=>({generateStructured:model,aiAvailability:vi.fn()}))
const base=sanitizeSiteHtml(readFileSync('tests/fixtures/bespoke-site.html','utf8')).html
const facts:BusinessFacts={businessId:'test',name:'TEST Salon Lumière',sector:'hair_salon',sectorLabel:'Coiffeur',templateId:'coiffeur',city:'Rouen',address:'3 rue Test',postcode:'76000',phoneE164:'+33235111111',phoneDisplay:'02 35 11 11 11',email:'contact@salon-lumiere.test',emailStatus:'SOURCE_CONFIRMED',lat:null,lon:null,socials:[],openingHours:null,websiteStatus:'NO_WEBSITE_KNOWN',websiteUrl:null,auditFindings:[]}
const plan={concept:'TEST',palette:[],typography:'Fraunces',layout:'Colonne',signature:'Titre',revisions:'Vérifié'}
const prior={html:base,concept:'AUTRE ENTREPRISE',typography:'Fraunces',layout:'Colonne',signature:'Titre',palette:[]}
beforeEach(()=>model.mockReset())
function answer(html:string){return {data:{designPlan:plan,html},model:'offline-fixture',costUsd:0}}
it('redesigns a disguised copy even when ordinary quality passes are disabled, without feeding its HTML back as a model',async()=>{
 const clone=base.replaceAll('--sage','--leaf').replace('<header>','<header><div>').replace('</header>','</div></header>')
 const distinct=base.replace('<header>','<aside>').replace('</header>','</aside>').replace(/section\{[^}]+\}/,'section{display:grid;grid-template-columns:1fr 2fr;padding:90px 8vw;gap:40px}').replace('</style>','aside{display:grid;grid-template-columns:2fr 1fr;align-items:end;padding:90px 8vw}h1{writing-mode:vertical-rl}</style>')
 model.mockResolvedValueOnce(answer(clone)).mockResolvedValueOnce(answer(distinct))
 const result=await runBespokePipeline({facts,prompt:'DOSSIER ENTREPRISE COURANTE',mediaUrls:[],passes:0,measure:false,recentDesigns:[prior]})
 expect(result.passes).toBe(1)
 expect(result.html).toContain('writing-mode:vertical-rl')
 expect(model.mock.calls[1]![0].instructions).toContain('RECONCEPTION OBLIGATOIRE')
 expect(model.mock.calls[1]![0].instructions).not.toContain('<html_actuel>')
})
it('never labels a persistent copy ready after the two bounded redesign attempts',async()=>{
 model.mockResolvedValue(answer(base))
 const log=vi.fn()
 await expect(runBespokePipeline({facts,prompt:'DOSSIER',mediaUrls:[],passes:0,measure:false,recentDesigns:[prior],log})).rejects.toThrow('personnalisation insuffisante')
 expect(model).toHaveBeenCalledTimes(3)
 expect(log.mock.calls.every(([,progress])=>progress>=0&&progress<=1)).toBe(true)
})
