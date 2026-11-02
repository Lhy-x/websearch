import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { classifyByKeywords, classifyByRules, stripQuoted } from '@/server/email/classify'
import { verifySvixSignature } from '@/server/email/providers'
import { isInWindow, nextWindowStart } from '@/server/campaigns/window'
import { buildDeterministicProposal, findProspectClaim, EMAIL_VARIANTS } from '@/server/proposals/content'

const msg = (o: Partial<{ from: string; subject: string; text: string; headers: Record<string, string> }>) => ({ from: 'client@salon.fr', subject: 'Re: proposition', text: '', headers: {}, ...o })

describe('reply classification rules', () => {
  it('detects bounces', () => expect(classifyByRules(msg({ from: 'MAILER-DAEMON@mx.fr', subject: 'Undelivered Mail Returned to Sender' }))?.label).toBe('BOUNCE'))
  it('detects auto-replies', () => expect(classifyByRules(msg({ headers: { 'Auto-Submitted': 'auto-replied' }, text: 'Je suis absente' }))?.label).toBe('OUT_OF_OFFICE'))
  it('detects unsubscribe requests', () => expect(classifyByRules(msg({ text: 'Merci de ne plus me contacter.' }))?.label).toBe('UNSUBSCRIBE'))
  it('detects explicit refusals', () => expect(classifyByRules(msg({ text: 'Non merci, pas intéressée.' }))?.label).toBe('NOT_INTERESTED'))
  it('leaves nuanced replies to AI/keywords', () => {
    const m = msg({ text: 'Bonjour, pouvez-vous me rappeler mardi ? On peut se voir au salon.' })
    expect(classifyByRules(m)).toBeNull()
    expect(classifyByKeywords(m).label).toBe('MEETING_REQUEST')
  })
  it('ignores quoted text', () => {
    expect(stripQuoted('Oui ça m’intéresse\n\nLe lun. 2 nov. 2026, Moi a écrit :\n> ne plus recevoir')).toBe('Oui ça m’intéresse')
    expect(classifyByRules(msg({ text: 'Oui ça m’intéresse\n> Vous ne souhaitez plus recevoir de message ? lien' }))).toBeNull()
  })
})

describe('webhook signature (Svix)', () => {
  const secret = 'whsec_' + Buffer.from('supersecretkey123').toString('base64')
  const sign = (id: string, ts: string, body: string) => 'v1,' + createHmac('sha256', Buffer.from('supersecretkey123')).update(`${id}.${ts}.${body}`).digest('base64')
  it('accepts valid and rejects tampered/expired', () => {
    const ts = String(Math.floor(Date.now() / 1000))
    expect(verifySvixSignature(secret, 'msg_1', ts, '{"a":1}', sign('msg_1', ts, '{"a":1}'))).toBe(true)
    expect(verifySvixSignature(secret, 'msg_1', ts, '{"a":2}', sign('msg_1', ts, '{"a":1}'))).toBe(false)
    const old = String(Math.floor(Date.now() / 1000) - 3600)
    expect(verifySvixSignature(secret, 'msg_1', old, '{}', sign('msg_1', old, '{}'))).toBe(false)
  })
})

describe('send window', () => {
  const w = { timezone: 'Europe/Paris', sendDays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1080 }
  it('respects days, hours and timezone', () => {
    expect(isInWindow(new Date('2026-11-02T09:30:00Z'), w)).toBe(true) // Mon 10:30 Paris
    expect(isInWindow(new Date('2026-11-02T07:30:00Z'), w)).toBe(false) // 08:30 Paris
    expect(isInWindow(new Date('2026-11-07T10:00:00Z'), w)).toBe(false) // Saturday
    expect(nextWindowStart(new Date('2026-11-07T10:00:00Z'), w)?.toISOString()).toBe('2026-11-09T08:00:00.000Z')
  })
})

describe('deterministic proposals', () => {
  const p = buildDeterministicProposal({ businessName: 'Salon Erika', sectorLabel: 'Coiffeur', city: 'Rouen', websiteStatus: 'NO_WEBSITE_KNOWN', websiteUrl: null, auditFindings: [], demoUrl: 'https://x.fr/preview/abc', offer: { name: 'Site vitrine', description: 'Site 5 sections.', price: '690 €' }, senderName: 'Liam', signature: 'Liam' })
  it('produces all variants, includes the demo link, no fabricated claims', () => {
    for (const v of EMAIL_VARIANTS) {
      expect(p[v].subject.length).toBeGreaterThan(3)
      expect(findProspectClaim(p[v].body)).toBeNull()
    }
    expect(p.initial.body).toContain('https://x.fr/preview/abc')
    expect(p.initial.body).not.toMatch(/n'a pas de site/) // never asserts absence as a fact when unconfirmed
  })
})
