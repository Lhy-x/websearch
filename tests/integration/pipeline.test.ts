import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql, closeDb } from '@/server/core/db'
import { persistCluster } from '@/server/search/run-search'
import type { RawPlace } from '@/server/connectors/types'
import { generateWebsite, lookupPreview, saveWebsiteVersion, getWebsiteVersion } from '@/server/sites/service'
import { generateProposal } from '@/server/proposals/service'
import { mergeBusinesses } from '@/server/business/merge'
import { resetDb } from './helpers'
import type { SiteConfig } from '@/lib/site/schema'

beforeEach(resetDb)
afterAll(closeDb)

const place = (o: Partial<RawPlace> = {}): RawPlace => ({
  source: 'overture', sourceRecordId: 'TEST-ov-1', name: 'TEST Coiffure Erika', sector: 'hair_salon', sourceCategory: 'hair_salon', address: '1 rue Test', postcode: '76000', city: 'Rouen', region: null, country: 'FR',
  lat: 49.44, lon: 1.09, phones: ['33235710211'], websites: [], emails: ['erika@example.test'], socials: [], confidence: 0.9, raw: {}, ...o,
})

describe('prospect persistence & dedup against the base', () => {
  it('re-running the same source record updates instead of duplicating', async () => {
    const a = await persistCluster([place()])
    const b = await persistCluster([place()])
    expect(a.created).toBe(true)
    expect(b.created).toBe(false)
    expect(b.id).toBe(a.id)
  })
  it('a second source with the same phone nearby merges into the same business, keeping both sources', async () => {
    const a = await persistCluster([place()])
    const b = await persistCluster([place({ source: 'osm', sourceRecordId: 'node/1', name: 'Erika Coiffure', lat: 49.4401, phones: ['02 35 71 02 11'], emails: [] })])
    expect(b.id).toBe(a.id)
    const src = await sql()`select source from business_sources where business_id = ${a.id} order by source`
    expect(src.map((s) => s.source)).toEqual(['osm', 'overture'])
  })
  it('records provenance, presence evidence and a score', async () => {
    const { id } = await persistCluster([place({ websites: ['https://www.planity.com/erika'] })])
    const [b] = await sql()<{ web_presence_status: string; score: number; email_status: string; web_presence_evidence: { finding: string }[] }[]>`select web_presence_status, score, email_status, web_presence_evidence from businesses where id = ${id}`
    expect(b!.web_presence_status).toBe('NO_WEBSITE_KNOWN') // planity is not an own website
    expect(b!.web_presence_evidence[0]!.finding).toBe('third_party_only')
    expect(b!.email_status).toBe('SOURCE_CONFIRMED')
    expect(b!.score).toBeGreaterThan(0)
    const scores = await sql()`select reasons from prospect_scores where business_id = ${id}`
    expect(scores).toHaveLength(1)
  })
  it('manual merge keeps sources and archives the duplicate', async () => {
    const a = await persistCluster([place()])
    const c = await persistCluster([place({ source: 'import', sourceRecordId: 'TEST-imp', name: 'Totally Other', phones: ['0611111111'], lat: 49.5, emails: [] })])
    await mergeBusinesses(a.id, c.id)
    const [dup] = await sql()<{ merged_into: string }[]>`select merged_into from businesses where id = ${c.id}`
    expect(dup!.merged_into).toBe(a.id)
    expect((await sql()`select 1 from business_sources where business_id = ${a.id}`).length).toBe(2)
  })
})

describe('site generation, versions & previews', () => {
  it('generates a deterministic site, versions edits with optimistic locking', async () => {
    const { id } = await persistCluster([place()])
    const g = await generateWebsite(id, { generator: 'deterministic' })
    expect(g.version).toBe(1)
    const v1 = (await getWebsiteVersion(g.websiteId))! as { version: number; config: SiteConfig }
    expect(v1.config.business.name).toBe('TEST Coiffure Erika')
    const edited = { ...v1.config, hero: { ...v1.config.hero, subtitle: 'Nouveau texte' } }
    expect(await saveWebsiteVersion(g.websiteId, edited, { baseVersion: 1 })).toBe(2)
    await expect(saveWebsiteVersion(g.websiteId, edited, { baseVersion: 1 })).rejects.toThrow(/Conflit/)
    await expect(saveWebsiteVersion(g.websiteId, { ...edited, hero: { ...edited.hero, primaryCta: { label: 'x', href: 'javascript:alert(1)' } } })).rejects.toThrow()
    const [b] = await sql()<{ pipeline_status: string }[]>`select pipeline_status from businesses where id = ${id}`
    expect(b!.pipeline_status).toBe('WEBSITE_GENERATED')
  })
  it('AI generation without a configured provider is reported as not configured (never faked)', async () => {
    const { id } = await persistCluster([place()])
    await expect(generateWebsite(id, { generator: 'ai' })).rejects.toThrow(/non configuré/)
  })
  it('previews can be disabled and expire', async () => {
    const { id } = await persistCluster([place()])
    const g = await generateWebsite(id, { generator: 'deterministic' })
    expect((await lookupPreview(g.previewToken)).status).toBe('ok')
    expect((await lookupPreview('x'.repeat(32))).status).toBe('not_found')
    await sql()`update generated_websites set preview_enabled = false where id = ${g.websiteId}`
    expect((await lookupPreview(g.previewToken)).status).toBe('disabled')
    await sql()`update generated_websites set preview_enabled = true, preview_expires_at = now() - interval '1 day' where id = ${g.websiteId}`
    expect((await lookupPreview(g.previewToken)).status).toBe('expired')
  })
  it('creates a proposal grounded in facts with the demo link', async () => {
    const { id } = await persistCluster([place()])
    const g = await generateWebsite(id, { generator: 'deterministic' })
    const p = await generateProposal({ businessId: id, websiteId: g.websiteId, generator: 'deterministic' })
    expect(p.content.initial.body).toContain(`/preview/${g.previewToken}`)
    expect(p.content.initial.body).toContain('TEST Coiffure Erika')
  })
})
