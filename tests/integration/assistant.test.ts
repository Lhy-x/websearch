import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql, closeDb } from '@/server/core/db'
import { executeAssistantAction, handleAssistantMessage } from '@/server/assistant/service'
import { insertTestBusiness, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)
const count = async (q: string) => Number((await sql().unsafe(q))[0]!.n)

describe('assistant (rules interpreter, real backend functions)', () => {
  it('read tools run immediately on real data; actions only produce a preview', async () => {
    for (let i = 0; i < 6; i++) await insertTestBusiness({ name: `TEST Prospect ${i}`, email: `p${i}@example.test`, phone: `+3323500000${i}` })
    await sql()`update businesses set score = 50 + (random()*40)::int`
    const r = await handleAssistantMessage('Génère une démonstration pour les cinq prospects les mieux qualifiés.')
    expect(r.interpreter).toBe('règles')
    const step = r.steps[0]!
    expect(step).toMatchObject({ tool: 'generate_sites', kind: 'action', status: 'needs_confirmation' })
    expect(step.result!.rows).toHaveLength(5)
    expect(await count(`select count(*) n from automation_jobs`)).toBe(0) // nothing executed yet
    const exec = await executeAssistantAction('generate_sites', step.input)
    expect(exec.summary).toMatch(/5 génération/)
    expect(await count(`select count(*) n from automation_jobs where type = 'website.generate'`)).toBe(5)
  })
  it('prepares a DRAFT campaign from the selection and sends nothing', async () => {
    const ids = [await insertTestBusiness({ email: 'a@example.test' }), await insertTestBusiness({ name: 'TEST sans email', email: null, phone: '+33235999999' })]
    const r = await handleAssistantMessage('Prépare une campagne pour ces prospects.', ids)
    expect(r.steps[0]!.status).toBe('needs_confirmation')
    expect(r.steps[0]!.result!.rows).toHaveLength(1) // only the prospect with an email
    await executeAssistantAction('prepare_campaign', r.steps[0]!.input)
    const [c] = await sql()<{ status: string; mode: string }[]>`select status, mode from campaigns`
    expect(c).toEqual({ status: 'DRAFT', mode: 'MANUAL' })
    expect(await count(`select count(*) n from campaign_prospects`)).toBe(1)
    expect(await count(`select count(*) n from outbound_messages`)).toBe(0)
  })
  it('search action queues a real search job after confirmation', async () => {
    const r = await handleAssistantMessage('Recherche les entreprises de nettoyage à Rouen sans site confirmé.')
    expect(r.steps[0]!.result!.summary).toMatch(/Rouen/)
    await executeAssistantAction('search_prospects', r.steps[0]!.input)
    const [run] = await sql()<{ params: { city: string; sector: string; websiteFilter: string } }[]>`select params from search_runs`
    expect(run!.params).toMatchObject({ city: 'Rouen', sector: 'cleaning', websiteFilter: 'no_website_confirmed' })
  })
  it('rejects invalid tool input and unknown tools', async () => {
    await expect(executeAssistantAction('send_all_emails', {})).rejects.toThrow(/inconnu/)
    await expect(executeAssistantAction('search_prospects', { city: '' })).rejects.toThrow()
  })
  it('says what it can do when the request is not understood', async () => {
    const r = await handleAssistantMessage('Quel temps fait-il ?')
    expect(r.steps).toHaveLength(0)
    expect(r.note).toMatch(/Je peux/)
  })
})
