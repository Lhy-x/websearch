/**
 * Web presence classification — deterministic.
 * An empty "website" field in ONE source is never treated as proof of absence:
 * NO_WEBSITE_CONFIRMED requires either a manual confirmation, or ≥2 independent website-capable
 * sources reporting no own website including at least one live check (Google Places / web search / crawl).
 */
export type PresenceStatus =
  | 'NO_WEBSITE_KNOWN'
  | 'NO_WEBSITE_CONFIRMED'
  | 'WEBSITE_FOUND'
  | 'WEBSITE_BROKEN'
  | 'WEBSITE_OUTDATED'
  | 'WEBSITE_LOW_QUALITY'
  | 'WEBSITE_GOOD'
  | 'UNVERIFIED'

export interface PresenceEvidence {
  source: string
  at: string
  finding: 'website_listed' | 'no_website' | 'third_party_only' | 'manual_no_website' | 'manual_website'
  live?: boolean
  detail?: string
}

export interface AuditSummary {
  reachable: boolean
  httpStatus: number | null
  qualityScore: number | null
  hasViewport: boolean | null
  httpsOk: boolean | null
  copyrightYear: number | null
}

/** Sources that publish websites for a place (Sirene doesn't, so its silence proves nothing). */
export const WEBSITE_CAPABLE_SOURCES = new Set(['overture', 'osm', 'google_places', 'import', 'manual', 'crawl'])

export function classifyPresence(input: { ownWebsite: string | null; evidence: PresenceEvidence[]; audit: AuditSummary | null; now?: Date }): PresenceStatus {
  const year = (input.now ?? new Date()).getFullYear()
  if (input.ownWebsite) {
    const a = input.audit
    if (!a) return 'WEBSITE_FOUND'
    if (!a.reachable || (a.httpStatus !== null && a.httpStatus >= 400)) return 'WEBSITE_BROKEN'
    const outdated = a.hasViewport === false || a.httpsOk === false || (a.copyrightYear !== null && a.copyrightYear <= year - 5)
    if (outdated) return 'WEBSITE_OUTDATED'
    if (a.qualityScore !== null && a.qualityScore < 50) return 'WEBSITE_LOW_QUALITY'
    return 'WEBSITE_GOOD'
  }
  if (input.evidence.some((e) => e.finding === 'manual_no_website')) return 'NO_WEBSITE_CONFIRMED'
  const negative = input.evidence.filter((e) => (e.finding === 'no_website' || e.finding === 'third_party_only') && WEBSITE_CAPABLE_SOURCES.has(e.source))
  const independent = new Set(negative.map((e) => e.source))
  if (independent.size >= 2 && negative.some((e) => e.live)) return 'NO_WEBSITE_CONFIRMED'
  if (negative.length) return 'NO_WEBSITE_KNOWN'
  return 'UNVERIFIED'
}

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  NO_WEBSITE_KNOWN: 'Aucun site connu',
  NO_WEBSITE_CONFIRMED: 'Absence de site confirmée',
  WEBSITE_FOUND: 'Site trouvé (non audité)',
  WEBSITE_BROKEN: 'Site inaccessible',
  WEBSITE_OUTDATED: 'Site obsolète',
  WEBSITE_LOW_QUALITY: 'Site de faible qualité',
  WEBSITE_GOOD: 'Site correct',
  UNVERIFIED: 'Non vérifié',
}
