import { afterAll, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { closeDb, sql } from '@/server/core/db'
import { closeBrowser, getBrowser } from '@/server/enrich/browser'
import { updateSettings } from '@/server/core/settings'
import { generateBespokeWebsite, reviseBespokeWebsite } from '@/server/sites/bespoke/generate'
import { getWebsiteVersion } from '@/server/sites/service'
import { isHtmlSite } from '@/lib/site/bespoke-schema'
import { renderVersion } from '@/server/sites/render-any'
import { exportSiteZip } from '@/server/sites/export'
import { sanitizeSilhouette } from '@/server/sites/glass/silhouette'
import { resetDb, insertTestBusiness } from './helpers'

const fixtures=path.resolve('tests/fixtures')
const base=readFileSync(path.join(fixtures,'bespoke-site.html'),'utf8')
const plan={concept:'Atelier optique original',palette:[{name:'Encre',hex:'#172138'}],typography:'Georgia',layout:'Hero asymétrique et colonne éditoriale',signature:'Sculpture originale',revisions:'Contrastes renforcés'}
const scene={silhouette:'<svg viewBox="0 0 100 100"><path d="M 50 4 L 96 50 L 50 96 L 4 50 Z"/></svg>',palette:['#172138','#b7ccff','#705bed'],description:'Sculpture de verre inspirée des gestes du métier'}
let dir:string
beforeEach(async()=>{await resetDb();dir=mkdtempSync(path.join(tmpdir(),'personalized-'));process.env.FAKE_CLI_DIR=dir;process.env.FAKE_CLI_LOG=path.join(dir,'calls');process.env.CLAUDE_CLI_PATH=path.join(fixtures,'fake-claude');await updateSettings({ai:{provider:'claude-code',costMode:'HIGH_QUALITY'},sites:{qualityPasses:0,visualReview:false}})})
afterAll(async()=>{delete process.env.FAKE_CLI_NO_SCENE;delete process.env.FAKE_CLI_DIR;delete process.env.FAKE_CLI_LOG;delete process.env.CLAUDE_CLI_PATH;await closeBrowser();await closeDb()})
function answer(html:string){writeFileSync(path.join(dir,'response-default.json'),JSON.stringify({designPlan:plan,html,glassScene:scene}))}

it('uses the uploaded skill and AI-authored HTML, persists the scene, renders WebGL and preserves it through revision/export', async()=>{
  const id=await insertTestBusiness({name:'TEST Salon Lumière',email:'contact@salon-lumiere.test',phone:'+33235111111'})
  const html=base.replace('</body>','<div data-glass-scene style="height:360px"></div></body>')
  answer(html)
  const generated=await generateBespokeWebsite(id,{personalized:true})
  expect(generated.generator).toContain('personnalise-skill')
  const [record]=await sql()<{template_id:string}[]>`select template_id from generated_websites where id=${generated.websiteId}`
  expect(record!.template_id).toBe('sur-mesure')
  const version=(await getWebsiteVersion(generated.websiteId))!.config
  expect(isHtmlSite(version)).toBe(true)
  if(!isHtmlSite(version))throw new Error('Expected authored HTML')
  expect(version.html).not.toContain('<script')
  expect(version.glassScene?.silhouette).toContain('M 50 4')
  const calls=readFileSync(path.join(dir,'calls'),'utf8')
  expect(calls).toContain('Premium 3D Glass')
  expect(calls).toContain('AUCUN template HTML')
  const rendered=await renderVersion(version,'preview','Démonstration indépendante')
  expect(rendered).toContain('data:text/javascript;base64,')
  expect(rendered).toContain('data-glass-fallback')
  expect(rendered).not.toContain('class="cinematic-container"')
  const browser=await getBrowser({softwareWebGL:true})
  const context=await browser.newContext({viewport:{width:390,height:844}})
  try {
    const page=await context.newPage();await page.setContent(rendered)
    await page.waitForFunction(()=>document.documentElement.dataset.glassState==='ready',undefined,{timeout:20000})
    expect(await page.locator('[data-glass-scene] canvas').count()).toBe(1)
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.waitForFunction(()=>document.documentElement.dataset.glassState==='static')
    expect(await page.locator('[data-glass-scene] canvas').count()).toBe(0)
    expect(await page.locator('[data-glass-fallback] svg').isVisible()).toBe(true)
  }finally{await context.close()}
  answer(html)
  await reviseBespokeWebsite(generated.websiteId,'Renforce la hiérarchie des titres')
  const revised=(await getWebsiteVersion(generated.websiteId))!.config
  expect(isHtmlSite(revised)&&revised.glassScene?.description).toBe(scene.description)
  expect((await exportSiteZip(revised)).buffer.length).toBeGreaterThan(100000)
},90000)

it('fails explicitly without AI and never generates a template substitute',async()=>{
  await updateSettings({ai:{provider:'none'}})
  const id=await insertTestBusiness()
  await expect(generateBespokeWebsite(id,{personalized:true})).rejects.toThrow(/nécessite Claude ou Codex/)
  expect(await sql()`select id from generated_websites`).toHaveLength(0)
})

it('rejects executable/foreign SVG and bounds geometry complexity',()=>{
  expect(()=>sanitizeSilhouette('<svg viewBox="0 0 100 100"><script>alert(1)</script></svg>')).toThrow()
  expect(()=>sanitizeSilhouette('<svg viewBox="0 0 100 100"><image href="https://x.test/a"/></svg>')).toThrow()
  expect(()=>sanitizeSilhouette('<svg viewBox="0 0 100 100"><path d="M 0 0 L 1e999 1 L 5 5 Z"/></svg>')).toThrow()
  expect(sanitizeSilhouette('<svg viewBox="0 0 100 100"><path onclick="alert(1)" d="M 0 0 L 90 0 L 50 90 Z"/></svg>')).not.toContain('onclick')
})

it('feeds a missing 3D slot back to the model and accepts only the corrected authored page',async()=>{
  const id=await insertTestBusiness({name:'TEST Salon Lumière',email:'contact@salon-lumiere.test',phone:'+33235111111'})
  await updateSettings({sites:{qualityPasses:1,visualReview:false}})
  const good=base.replace('</body>','<div data-glass-scene style="height:360px"></div></body>')
  writeFileSync(path.join(dir,'response-1.json'),JSON.stringify({designPlan:plan,html:base,glassScene:scene}))
  writeFileSync(path.join(dir,'response-2.json'),JSON.stringify({designPlan:plan,html:good,glassScene:scene}))
  const generated=await generateBespokeWebsite(id,{personalized:true})
  expect(generated.passes).toBe(1)
  const config=(await getWebsiteVersion(generated.websiteId))!.config
  expect(isHtmlSite(config)&&config.html).toContain('data-glass-scene')
  expect(readFileSync(path.join(dir,'calls'),'utf8')).toContain('exactement un emplacement')
},60000)

it('renders a different number of glass fragments and a transparent composition from the individual scene direction',async()=>{
 const html=base.replace('</body>','<div data-glass-scene style="height:360px"></div></body>')
 const presentation={fragments:3,depth:.6,bevel:.02,rotation:.3,spread:1.1,turn:-.4,roughness:.22,exposure:1.3,transparent:true,accent:'none' as const}
 const renderedDocument=await renderVersion({schemaVersion:1,kind:'html',html,glassScene:{...scene,presentation},designPlan:plan,businessName:'TEST Salon Lumière',media:[],report:null},'export')
 const browser=await getBrowser({softwareWebGL:true}),context=await browser.newContext({viewport:{width:390,height:844}})
 try{
  const page=await context.newPage();await page.setContent(renderedDocument)
  await page.waitForFunction(()=>document.documentElement.dataset.glassState==='ready',undefined,{timeout:20000})
  const rendered=await page.evaluate(()=>{const runtime=(window as unknown as {__personalizedGlass:{pieces:number;presentation:unknown}}).__personalizedGlass;const canvas=document.querySelector('canvas');return {pieces:runtime.pieces,presentation:runtime.presentation,alpha:canvas?.getContext('webgl2')?.getContextAttributes()?.alpha}})
  expect(rendered.pieces).toBe(3);expect(rendered.presentation).toEqual(presentation);expect(rendered.alpha).toBe(true)
 }finally{await context.close()}
},60000)

it('builds a site without the glass engine when its own art direction has no sculpture', async()=>{
  process.env.FAKE_CLI_NO_SCENE='1'
  try{
    const id=await insertTestBusiness({name:'TEST Salon Lumière',email:'contact@salon-lumiere.test',phone:'+33235111111'})
    writeFileSync(path.join(dir,'response-default.json'),JSON.stringify({designPlan:plan,html:base}))
    const generated=await generateBespokeWebsite(id,{personalized:true})
    const version=(await getWebsiteVersion(generated.websiteId))!.config
    if(!isHtmlSite(version))throw new Error('Expected authored HTML')
    expect(version.glassScene).toBeUndefined()
    const generation=readFileSync(path.join(dir,'calls'),'utf8').trim().split('\n').map(line=>JSON.parse(line)).filter(call=>call.phase==='generation')
    expect(generation.length).toBeGreaterThan(0)
    expect(generation.every(call=>!String(call.stdin).includes('Premium 3D Glass')&&!JSON.stringify(call.argv).includes('Premium 3D Glass'))).toBe(true)
    expect(JSON.stringify(generation)).toContain('n’a PAS de sculpture 3D')
    expect(await renderVersion(version,'preview','Démonstration indépendante')).not.toContain('data:text/javascript;base64,')
  }finally{delete process.env.FAKE_CLI_NO_SCENE}
})
