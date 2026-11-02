import { parse } from 'node-html-parser'
import { findForbiddenClaim } from '@/lib/site/schema'
import type { BusinessFacts } from '@/lib/site/facts'
import { normalizeName } from '../../core/normalize'
import type { QualityIssue } from '@/lib/site/bespoke-schema'

export function visibleText(html: string): string {
  const root = parse(html.replace(/>(?=<)/g, '> '), { blockTextElements: { script: false, style: false, noscript: false } })
  root.querySelectorAll('style,script,noscript,svg').forEach((n) => n.remove())
  return root.textContent.replace(/\s+/g, ' ').trim()
}

const digits = (s: string) => s.replace(/\D/g, '')
/** Last 9 digits identify a FR/BE/CH number regardless of +33 / 0 prefixes. */
const phoneKey = (s: string) => digits(s).slice(-9)

/**
 * Deterministic checks of a bespoke site against the verified facts. "critical" = must be fixed
 * (invented contact data or claims), "major" = quality problem worth a correction pass.
 */
export function checkAgainstFacts(html: string, f: BusinessFacts): QualityIssue[] {
  const issues: QualityIssue[] = []
  const add = (code: string, severity: QualityIssue['severity'], message: string) => issues.push({ code, severity, message })
  const text = visibleText(html)
  const root = parse(html)

  // 1. fabricated claims — a verified creation year from Sirene may be stated
  const allowed = f.creationYear ? new RegExp(`\\b${f.creationYear}\\b`) : null
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const bad = findForbiddenClaim(sentence)
    if (bad && !(allowed && allowed.test(bad))) add('claim', 'critical', `Affirmation invérifiable : « ${sentence.slice(0, 140)} »`)
  }
  // 2. contact data must be exactly the verified one
  const knownPhone = f.phoneE164 ? phoneKey(f.phoneE164) : null
  const phoneLike = text.match(/(?:\+\s?3[23]|\b0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}\b/g) ?? []
  for (const p of phoneLike) if (!knownPhone || phoneKey(p) !== knownPhone) add('phone_unknown', 'critical', `Numéro de téléphone non vérifié : ${p}`)
  for (const a of root.querySelectorAll('a[href^="tel:"]')) if (!knownPhone || phoneKey(a.getAttribute('href') ?? '') !== knownPhone) add('phone_unknown', 'critical', `Lien tel: non vérifié : ${a.getAttribute('href')}`)
  const emails = new Set([...(text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []), ...root.querySelectorAll('a[href^="mailto:"]').map((a) => (a.getAttribute('href') ?? '').slice(7).split('?')[0]!)])
  for (const e of emails) if (!f.email || e.toLowerCase() !== f.email.toLowerCase()) add('email_unknown', 'critical', `Email non vérifié : ${e}`)
  if (knownPhone && !root.querySelector('a[href^="tel:"]')) add('no_tel_link', 'major', 'Aucun lien cliquable tel: alors que le téléphone est connu')
  if (!knownPhone && !f.email) {
    /* nothing to link: the site must point to the address / map */
  }
  // 3. identity & structure
  if (!normalizeName(text).includes(normalizeName(f.name))) add('name_missing', 'major', `Le nom « ${f.name} » n’apparaît pas tel quel`)
  const h1 = root.querySelectorAll('h1')
  if (h1.length !== 1) add('h1', 'major', `${h1.length} titre(s) H1 (exactement 1 attendu)`)
  if (!/<html[^>]+lang=/i.test(html)) add('lang', 'minor', 'Attribut lang manquant sur <html>')
  if (!root.querySelector('meta[name="viewport"]')) add('viewport', 'major', 'Balise viewport manquante')
  if (!root.querySelector('title')?.textContent.trim()) add('title', 'minor', 'Balise <title> manquante')
  if (text.length < 400) add('thin', 'major', 'Contenu trop mince')
  if (html.length > 400_000) add('heavy', 'major', 'Document trop lourd (> 400 Ko)')
  if (f.address && f.city && !normalizeName(text).includes(normalizeName(f.city))) add('city_missing', 'minor', `La ville « ${f.city} » n’apparaît pas`)
  return issues
}
