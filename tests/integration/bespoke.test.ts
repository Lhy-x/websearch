import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql, closeDb } from '@/server/core/db'
import { updateSettings } from '@/server/core/settings'
import { callCli, cliStatus } from '@/server/ai/cli'
import { z } from 'zod'
import { persistCluster } from '@/server/search/run-search'
import { generateBespokeWebsite, reviseBespokeWebsite } from '@/server/sites/bespoke/generate'
import { getWebsiteVersion, lookupPreview } from '@/server/sites/service'
import { renderVersion } from '@/server/sites/render-any'
import { HANDLERS } from '@/server/jobs/handlers'
import { closeBrowser } from '@/server/enrich/browser'
import { isHtmlSite } from '@/lib/site/bespoke-schema'
import type { RawPlace } from '@/server/connectors/types'
import { enqueueJob, type Job } from '@/server/jobs/queue'
import { resetDb } from './helpers'

const FIX = path.resolve('tests/fixtures')
const SITE = readFileSync(path.join(FIX, 'bespoke-site.html'), 'utf8')
const PLAN = { concept: 'Salon de quartier sage et laiton', palette: [{ name: 'Encre', hex: '#1f2a2e' }, { name: 'Papier', hex: '#f6f7f2' }, { name: 'Sauge', hex: '#7d9a86' }, { name: 'Laiton', hex: '#b08d57' }], typography: 'Fraunces + Georgia', layout: 'Colonne éditoriale', signature: 'Titre XXL', revisions: 'Abandon du crème générique' }
let dir: string
let log: string

function responses(...htmls: string[]) {
  dir = mkdtempSync(path.join(tmpdir(), 'fakecli-'))
  log = path.join(dir, 'calls.log')
  htmls.forEach((h, i) => writeFileSync(path.join(dir, `response-${i + 1}.json`), JSON.stringify({ designPlan: PLAN, html: h })))
  process.env.FAKE_CLI_DIR = dir
  process.env.FAKE_CLI_LOG = log
}
const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { flavour: string; argv: string[]; stdin: string;phase?:string }).filter(l=>l.phase!=='direction') : [])

const place: RawPlace = {
  source: 'overture', sourceRecordId: 'TEST-bespoke-1', name: 'TEST Salon Lumière', sector: 'hair_salon', sourceCategory: 'hair_salon', address: '3 rue Test', postcode: '76000', city: 'Rouen', region: null, country: 'FR',
  lat: 49.4431, lon: 1.0993, phones: ['0235111111'], websites: [], emails: ['contact@salon-lumiere.test'], socials: [], confidence: 0.9, raw: {},
}

beforeEach(async () => {
  await resetDb()
  process.env.CLAUDE_CLI_PATH = path.join(FIX, 'fake-claude')
  process.env.CODEX_CLI_PATH = path.join(FIX, 'fake-codex')
  delete process.env.FAKE_CLI_MODE
  await updateSettings({ ai: { provider: 'claude-code' }, sites: { qualityPasses: 1, visualReview: false } })
  await cliStatus('claude-code', true)
})
afterAll(async () => {
  await closeBrowser()
  await closeDb()
})

describe('subscription CLIs (test doubles of claude / codex)', () => {
  it('claude: headless, no tools, JSON schema, prompt on stdin, never --bare (keeps the subscription login)', async () => {
    responses(SITE)
    const out = await callCli({ provider: 'claude-code', model: 'opus', system: 'SYS', prompt: 'DOSSIER', schema: z.object({ designPlan: z.unknown(), html: z.string() }) })
    expect((out.data as { html: string }).html).toContain('TEST Salon Lumière')
    const [c] = calls()
    expect(c!.argv).toEqual(expect.arrayContaining(['-p', '--output-format', 'json', '--tools', '', '--json-schema', '--model', 'opus', '--no-session-persistence']))
    expect(c!.argv).not.toContain('--bare')
    expect(c!.stdin).toBe('DOSSIER')
  })
  it('codex: read-only sandbox, strict output schema file, answer read from -o', async () => {
    responses(SITE)
    const out = await callCli({ provider: 'codex', system: 'SYS', prompt: 'DOSSIER', schema: z.object({ designPlan: z.unknown(), html: z.string() }) })
    expect((out.data as { html: string }).html).toContain('<h1>')
    const [c] = calls()
    expect(c!.argv).toEqual(expect.arrayContaining(['exec', '--sandbox', 'read-only', '--ephemeral', '--output-schema', '-o', '-']))
    expect(c!.stdin).toContain('SYS')
  })
  it('reports "not logged in" and subscription limits explicitly', async () => {
    responses(SITE)
    process.env.FAKE_CLI_MODE = 'notloggedin'
    await expect(callCli({ provider: 'claude-code', system: 's', prompt: 'p', schema: z.object({ a: z.string() }) })).rejects.toThrow(/claude auth login/)
    expect((await cliStatus('claude-code', true)).loggedIn).toBe(false)
    process.env.FAKE_CLI_MODE = 'limit'
    await expect(callCli({ provider: 'claude-code', system: 's', prompt: 'p', schema: z.object({ a: z.string() }) })).rejects.toThrow(/Limite de l’abonnement/)
  })
})

describe('bespoke site generation (subscription provider)', () => {
  it('generates, sanitizes, checks, renders and stores a unique site from the facts dossier', async () => {
    responses(SITE)
    const { id } = await persistCluster([place])
    const g = await generateBespokeWebsite(id)
    const v = (await getWebsiteVersion(g.websiteId))!
    expect(isHtmlSite(v.config)).toBe(true)
    if (!isHtmlSite(v.config)) return
    expect(v.config.html).not.toMatch(/<script|onclick|evil\.example|images\.example/)
    expect(v.config.designPlan?.concept).toBe(PLAN.concept)
    // the prompt carried the frontend-design guidance + verified facts
    const [c] = calls()
    const system = c!.argv[c!.argv.indexOf('--system-prompt') + 1]!
    expect(system).toContain('frontend-design')
    expect(system).toContain('Spend your boldness in one place')
    expect(c!.stdin).toContain('"telephone_lien": "tel:+33235111111"')
    expect(c!.stdin).toContain('contact@salon-lumiere.test')
    // The separate direction call is recorded as well as the HTML call.
    expect((await sql()`select operation from api_usage where operation='site_direction' and success`)).toHaveLength(1)
    // usage recorded at 0 $ (subscription)
    const [u] = await sql()<{ provider: string; cost_usd: string; units: number }[]>`select provider, cost_usd, units from api_usage where success and operation='site_bespoke'`
    expect(u).toMatchObject({ provider: 'claude-code', units: 1 })
    expect(Number(u!.cost_usd)).toBe(0)
    // public preview: banner + noindex
    const p = await lookupPreview(g.previewToken)
    const html = await renderVersion(p.config, 'preview', 'Démonstration non officielle')
    expect(html).toContain('Démonstration non officielle')
    expect(html).toContain('noindex')
  })

  it('invented contact data triggers an automatic correction pass fed with the detected problems', async () => {
    const bad = SITE.replace('</footer>', '<p>Réservez au 06 12 34 56 78 — 4,9 étoiles sur Google !</p></footer>')
    responses(bad, SITE)
    const { id } = await persistCluster([place])
    const g = await generateBespokeWebsite(id)
    expect(g.passes).toBe(1)
    const second = calls()[1]!
    expect(second.stdin).toContain('PROBLÈMES DÉTECTÉS')
    expect(second.stdin).toContain('06 12 34 56 78')
    const v = (await getWebsiteVersion(g.websiteId))!
    expect(isHtmlSite(v.config) && v.config.html).not.toContain('06 12 34 56 78')
  })

  it('a site that keeps inventing facts is rejected; legacy "auto" mode never substitutes a template', async () => {
    const bad = SITE.replace('</footer>', '<p>Plus de 30 ans d’expérience, 5000 clients satisfaits.</p></footer>')
    responses(bad, bad, bad, bad)
    const { id } = await persistCluster([place])
    await expect(generateBespokeWebsite(id)).rejects.toThrow(/Site rejeté/)
    const [w] = await sql()<{ status: string }[]>`select status from generated_websites`
    expect(w!.status).toBe('ERROR')
    // The legacy alias must fail visibly rather than return an unrelated catalogue layout.
    responses(bad,bad)
    for(const n of [1,2])writeFileSync(path.join(dir,`response-${n}.json`),JSON.stringify({designPlan:PLAN,html:bad.replace('</body>','<div data-glass-scene style="height:360px"></div></body>'),glassScene:{silhouette:'<svg viewBox="0 0 100 100"><path d="M 50 4 L 96 50 L 50 96 L 4 50 Z"/></svg>',palette:['#172138','#b7ccff','#705bed'],description:'TEST Sculpture originale'}}))
    const {job}=await enqueueJob('website.generate',{businessId:id,generator:'auto'})
    const ctx={job:job as Job,log:async()=>{},isActive:async()=>true}
    await expect(HANDLERS['website.generate']({businessId:id,generator:'auto'},ctx)).rejects.toThrow(/Site rejeté/)
    expect(await sql()`select id from generated_websites where status='READY'`).toHaveLength(0)

  })

  it('visual review: the model receives real screenshots (desktop + mobile) and refines its site', async () => {
    await updateSettings({ sites: { visualReview: true } })
    responses(SITE, SITE.replace('Un salon de quartier', 'Un salon de quartier lumineux'))
    const { id } = await persistCluster([place])
    const g = await generateBespokeWebsite(id)
    expect(g.passes).toBe(1)
    const log = calls()
    const imagesLine = log.find((l) => 'images' in l) as unknown as { images: number }
    expect(imagesLine.images).toBe(2)
    const second = log.filter((l) => l.argv)[1]!
    expect(second.argv).toEqual(expect.arrayContaining(['--input-format', 'stream-json']))
    expect(second.stdin).toContain('CAPTURES JOINTES')
    const v = (await getWebsiteVersion(g.websiteId))!
    expect(isHtmlSite(v.config) && v.config.html).toContain('quartier lumineux')
  })

  it('revises a bespoke site from a natural-language instruction (new version, checks re-run)', async () => {
    responses(SITE, SITE.replace('--sage:#7d9a86', '--sage:#1d3557'))
    const { id } = await persistCluster([place])
    const g = await generateBespokeWebsite(id)
    const r = await reviseBespokeWebsite(g.websiteId, 'Passe la palette en bleu nuit')
    expect(r.version).toBe(2)
    expect(calls()[1]!.stdin).toContain('Passe la palette en bleu nuit')
    const v = (await getWebsiteVersion(g.websiteId))!
    expect(isHtmlSite(v.config) && v.config.html).toContain('#1d3557')
  })
})
