import { SECTOR_BY_ID } from '@/lib/sectors'
import type { PresenceStatus } from '../enrich/presence'
import type { Settings } from '../core/settings'

export type Weights = Settings['scoring']

export interface ScoreInput {
  presence: PresenceStatus
  sector: string | null
  emailStatus: 'SOURCE_CONFIRMED' | 'UNVERIFIED' | 'INVALID' | 'NONE'
  hasPhone: boolean
  hasAddress: boolean
  hasCoordinates: boolean
  sourceCount: number
  avgSourceConfidence: number | null
  operatingStatus: string | null
  pipelineStatus: string
  doNotContact: boolean
  explicitNeed: boolean
  hasSiret: boolean
}

export interface ScoreReason {
  label: string
  points: number
}

export interface ScoreResult {
  score: number
  confidence: number
  priority: 'A' | 'B' | 'C' | 'D'
  reasons: ScoreReason[]
}

/**
 * Deterministic commercial score (0-100) + data-confidence score (0-100).
 * Same inputs ⇒ same output. Weights come from Settings → Scoring.
 */
export function computeScore(i: ScoreInput, w: Weights, targetSectors: string[] = []): ScoreResult {
  const reasons: ScoreReason[] = []
  const add = (label: string, points: number) => {
    if (points !== 0) reasons.push({ label, points: Math.round(points * 10) / 10 })
  }
  if (i.doNotContact) {
    return { score: 0, confidence: 100, priority: 'D', reasons: [{ label: 'Opposition / ne pas contacter', points: 0 }] }
  }

  const presencePoints: Partial<Record<PresenceStatus, [string, number]>> = {
    NO_WEBSITE_CONFIRMED: ['Aucun site après vérification multi-source', w.noWebsiteConfirmed],
    NO_WEBSITE_KNOWN: ['Aucun site connu (absence non confirmée)', w.noWebsiteKnown],
    WEBSITE_BROKEN: ['Site existant inaccessible ou en erreur', w.websiteBroken],
    WEBSITE_LOW_QUALITY: ['Site existant de faible qualité', w.websiteLowQuality],
    WEBSITE_OUTDATED: ['Site existant obsolète (mobile/HTTPS/ancienneté)', w.websiteOutdated],
    WEBSITE_FOUND: ['Site trouvé, non encore audité', w.websiteOutdated * 0.3],
    WEBSITE_GOOD: ['Site existant de bonne qualité', 0],
  }
  const p = presencePoints[i.presence]
  if (p) add(p[0], p[1])
  else add('Présence web non vérifiée', w.noWebsiteKnown * 0.4)

  const sector = i.sector ? SECTOR_BY_ID.get(i.sector) : undefined
  let relevance = sector?.relevance ?? 0.3
  if (targetSectors.length && i.sector) relevance = targetSectors.includes(i.sector) ? 1 : relevance * 0.5
  add(sector ? `Activité « ${sector.label} » (pertinence ${Math.round(relevance * 100)} %)` : 'Activité non catégorisée', w.sectorRelevance * relevance)

  if (i.emailStatus === 'SOURCE_CONFIRMED') add('Email professionnel publié par une source', w.emailAvailable)
  else if (i.emailStatus === 'UNVERIFIED') add('Email trouvé mais non vérifié', w.emailAvailable * 0.5)
  else add('Aucun email exploitable', 0)

  if (i.hasPhone) add('Téléphone professionnel disponible', w.phoneAvailable)
  const quality = (i.hasAddress ? 0.4 : 0) + (i.hasCoordinates ? 0.2 : 0) + (i.sourceCount >= 2 ? 0.25 : 0) + (i.hasSiret ? 0.15 : 0)
  add('Qualité des informations collectées', w.dataQuality * quality)
  if (i.operatingStatus === 'open' || i.operatingStatus === null) add('Établissement en activité', i.operatingStatus === 'open' ? w.operatingOpen : 0)
  else add(`Statut d’activité : ${i.operatingStatus}`, -w.operatingOpen * 2)
  if (i.explicitNeed) add('Besoin explicite exprimé', w.explicitNeed)
  if (['CONTACTED', 'REPLIED'].includes(i.pipelineStatus)) add('Déjà contacté', -w.interactionPenaltyContacted)
  if (i.pipelineStatus === 'LOST') add('Opportunité perdue', -w.interactionPenaltyContacted * 2)

  const max = Math.max(w.noWebsiteConfirmed, w.websiteBroken) + w.sectorRelevance + w.emailAvailable + w.phoneAvailable + w.dataQuality + w.operatingOpen + w.explicitNeed
  const raw = reasons.reduce((s, r) => s + r.points, 0)
  const score = max > 0 ? Math.max(0, Math.min(100, Math.round((100 * raw) / max))) : 0

  const presenceConf: Record<PresenceStatus, number> = {
    NO_WEBSITE_CONFIRMED: 30, WEBSITE_GOOD: 30, WEBSITE_BROKEN: 28, WEBSITE_LOW_QUALITY: 28, WEBSITE_OUTDATED: 28,
    WEBSITE_FOUND: 18, NO_WEBSITE_KNOWN: 10, UNVERIFIED: 0,
  }
  const confidence = Math.round(
    Math.min(
      100,
      presenceConf[i.presence] +
        Math.min(i.sourceCount, 3) * 10 +
        (i.avgSourceConfidence ?? 0.5) * 20 +
        (i.hasAddress ? 10 : 0) +
        (i.emailStatus === 'SOURCE_CONFIRMED' ? 10 : 0) +
        (i.hasSiret ? 0 : 0),
    ),
  )
  const priority = score >= 75 ? 'A' : score >= 55 ? 'B' : score >= 35 ? 'C' : 'D'
  return { score, confidence, priority, reasons }
}
