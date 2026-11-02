import { distance } from 'fastest-levenshtein'
import { domainOf, isThirdPartyHost, normalizeName, normalizePhone } from '../core/normalize'
import { haversineKm } from '../core/geo'

/**
 * Record linkage between business records coming from different sources.
 * Deterministic and explainable: every decision lists its reasons.
 *  MERGE    → same business, safe to merge automatically
 *  REVIEW   → plausible duplicate, needs a human decision (never merged automatically)
 *  DISTINCT → different businesses
 */
export interface MatchCandidate {
  name: string
  city?: string | null
  lat: number | null
  lon: number | null
  phones: string[]
  websites: string[]
  siret?: string | null
  postcode?: string | null
  country?: string | null
}

export interface MatchResult {
  score: number
  decision: 'MERGE' | 'REVIEW' | 'DISTINCT'
  reasons: string[]
}

const GENERIC = new Set(['le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'au', 'aux', 'chez', 'the', 'salon', 'coiffure', 'coiffeur', 'coiffeuse', 'restaurant', 'cafe', 'bar', 'boulangerie', 'patisserie', 'garage', 'auto', 'automobile', 'plomberie', 'plombier', 'electricite', 'electricien', 'agence', 'immobilier', 'immobiliere', 'cabinet', 'studio', 'atelier', 'institut', 'beaute', 'barber', 'barbier', 'shop', 'nettoyage', 'photographe', 'photo', 'architecte', 'architecture', 'conseil', 'services', 'service', 'entreprise', 'ets', 'coiff', 'coif', 'hair', 'beauty', 'style', 'mixte', 'homme', 'femme', 'espace', 'maison', 'boutique', 'centre', 'sas', 'sarl'])

/** Normalised Levenshtein similarity in [0,1]. */
export function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  return 1 - distance(a, b) / Math.max(a.length, b.length)
}

/** Tokens that identify the business: generic sector words and place names removed. */
export function distinctiveTokens(name: string, stop: Set<string> = new Set()): string[] {
  const toks = normalizeName(name).split(' ').filter(Boolean)
  return toks.filter((t) => !GENERIC.has(t) && !stop.has(t) && t.length > 1)
}

function placeTokens(...places: (string | null | undefined)[]): Set<string> {
  return new Set(places.flatMap((p) => (p ? normalizeName(p).split(' ') : [])).filter((t) => t.length > 2))
}

/** Token-set similarity in [0,1] on distinctive tokens (generic sector words removed). */
export function nameSimilarity(a: string, b: string, stop: Set<string> = new Set()): number {
  const ta = new Set(distinctiveTokens(a, stop))
  const tb = new Set(distinctiveTokens(b, stop))
  // nothing distinctive left (e.g. "Le Salon Rouen"): only an exact normalised match counts
  if (!ta.size || !tb.size) return normalizeName(a) === normalizeName(b) ? 0.9 : 0
  const inter = [...ta].filter((t) => tb.has(t)).sort()
  const da = [...ta].filter((t) => !tb.has(t)).sort()
  const db = [...tb].filter((t) => !ta.has(t)).sort()
  const s0 = inter.join(' ')
  const s1 = [s0, ...da].join(' ').trim()
  const s2 = [s0, ...db].join(' ').trim()
  const best = Math.max(s0 ? ratio(s0, s1) : 0, s0 ? ratio(s0, s2) : 0, ratio(s1, s2))
  // a single shared token among many different ones should not look identical
  if (inter.length && (da.length || db.length) && inter.length === 1 && Math.min(ta.size, tb.size) > 1) return Math.min(best, 0.75)
  return best
}

function ownDomains(urls: string[]): Set<string> {
  return new Set(urls.filter((u) => !isThirdPartyHost(u)).map(domainOf).filter((d): d is string => !!d))
}
function phones(list: string[], country?: string | null): Set<string> {
  return new Set(list.map((p) => normalizePhone(p, country ?? 'FR')).filter((p): p is string => !!p))
}

export function matchBusinesses(a: MatchCandidate, b: MatchCandidate): MatchResult {
  const reasons: string[] = []
  if (a.siret && b.siret) {
    if (a.siret === b.siret) return { score: 1, decision: 'MERGE', reasons: ['SIRET identique'] }
  }
  const sim = nameSimilarity(a.name, b.name, placeTokens(a.city, b.city))
  const dist = a.lat != null && a.lon != null && b.lat != null && b.lon != null ? haversineKm(a.lat, a.lon, b.lat, b.lon) * 1000 : null
  const pa = phones(a.phones, a.country)
  const pb = phones(b.phones, b.country)
  const samePhone = [...pa].some((p) => pb.has(p))
  const da = ownDomains(a.websites)
  const dbb = ownDomains(b.websites)
  const sameDomain = [...da].some((d) => dbb.has(d))

  let score = sim * 0.45
  reasons.push(`Similarité du nom ${(sim * 100).toFixed(0)} %`)
  if (dist !== null) {
    if (dist < 60) score += 0.3
    else if (dist < 200) score += 0.2
    else if (dist < 600) score += 0.05
    else if (dist > 2000) score -= 0.4
    reasons.push(`Distance ${Math.round(dist)} m`)
  }
  if (samePhone) {
    score += 0.35
    reasons.push('Téléphone identique')
  }
  if (sameDomain) {
    score += 0.3
    reasons.push('Domaine web identique')
  }
  if (a.postcode && b.postcode && a.postcode === b.postcode) score += 0.03
  if (a.siret && b.siret && a.siret !== b.siret) {
    score -= 0.5
    reasons.push('SIRET différents')
  }
  score = Math.max(0, Math.min(1, score))

  const near = dist !== null && dist < 250
  // chains share a domain (and sometimes a hotline) across branches: far apart ⇒ different establishments
  const strongId = (samePhone || sameDomain) && (dist === null || dist < 1000)
  let decision: MatchResult['decision'] = 'DISTINCT'
  if (a.siret && b.siret && a.siret !== b.siret) decision = sim >= 0.9 && near ? 'REVIEW' : 'DISTINCT'
  else if (strongId && sim >= 0.5) decision = 'MERGE'
  else if (sim >= 0.92 && dist !== null && dist < 120) decision = 'MERGE'
  else if ((strongId && near) || (sim >= 0.75 && near) || (sim >= 0.92 && dist !== null && dist < 600)) decision = 'REVIEW'
  return { score, decision, reasons }
}

/**
 * Cluster a list of records (single-linkage on MERGE decisions) using a spatial grid so that the
 * comparison stays ~O(n). REVIEW pairs are returned separately and never merged.
 */
export function clusterRecords<T extends MatchCandidate>(records: T[]): { clusters: T[][]; reviews: [number, number, MatchResult][] } {
  const parent = records.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  const cell = (r: T) => (r.lat == null || r.lon == null ? 'nogeo' : `${Math.floor(r.lat / 0.005)}:${Math.floor(r.lon / 0.007)}`)
  const grid = new Map<string, number[]>()
  records.forEach((r, i) => {
    const k = cell(r)
    grid.set(k, [...(grid.get(k) ?? []), i])
  })
  const reviews: [number, number, MatchResult][] = []
  records.forEach((r, i) => {
    const neighbours: number[] = []
    if (r.lat == null || r.lon == null) neighbours.push(...(grid.get('nogeo') ?? []))
    else {
      const cy = Math.floor(r.lat / 0.005)
      const cx = Math.floor(r.lon / 0.007)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) neighbours.push(...(grid.get(`${cy + dy}:${cx + dx}`) ?? []))
    }
    for (const j of neighbours) {
      if (j <= i) continue
      const m = matchBusinesses(r, records[j]!)
      if (m.decision === 'MERGE') parent[find(i)] = find(j)
      else if (m.decision === 'REVIEW') reviews.push([i, j, m])
    }
  })
  const groups = new Map<number, T[]>()
  records.forEach((r, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), r])
  })
  return { clusters: [...groups.values()], reviews: reviews.filter(([i, j]) => find(i) !== find(j)) }
}
