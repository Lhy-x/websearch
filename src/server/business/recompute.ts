import { sql } from '../core/db'
import { getSettings } from '../core/settings'
import { classifyPresence, type AuditSummary, type PresenceEvidence, type PresenceStatus } from '../enrich/presence'
import { computeScore } from '../scoring/score'
import { domainOf, isThirdPartyHost } from '../core/normalize'

interface Row {
  id: string
  sector: string | null
  phone: string | null
  address: string | null
  lat: number | null
  siret: string | null
  operating_status: string | null
  pipeline_status: string
  do_not_contact: boolean
  web_presence_evidence: PresenceEvidence[]
  tags: string[]
  score: number | null
}

/**
 * Re-derive every computed field of a business from its stored facts:
 * primary website/email, web presence status, commercial score, confidence and priority.
 * Writes a prospect_scores row when the score or reasons change (history).
 */
export async function recomputeBusiness(businessId: string): Promise<{ score: number; presence: PresenceStatus } | null> {
  const db = sql()
  const [b] = await db<Row[]>`select id, sector, phone, address, lat, siret, operating_status, pipeline_status, do_not_contact,
      web_presence_evidence, tags, score from businesses where id = ${businessId}`
  if (!b) return null
  const contacts = await db<{ kind: string; normalized_value: string; status: string; is_primary: boolean; opted_out: boolean; confidence: number | null }[]>`
    select kind, normalized_value, status, is_primary, opted_out, confidence from business_contacts where business_id = ${businessId}`
  const sources = await db<{ source: string; confidence: number | null }[]>`select source, confidence from business_sources where business_id = ${businessId}`
  const [audit] = await db<{ http_status: number | null; quality_score: number | null; has_viewport: boolean | null; https_ok: boolean | null; copyright_year: number | null; error: string | null; url: string }[]>`
    select http_status, quality_score, has_viewport, https_ok, copyright_year, error, url from website_audits where business_id = ${businessId} order by created_at desc limit 1`

  const websites = contacts.filter((c) => c.kind === 'website' && c.status !== 'INVALID' && !isThirdPartyHost(c.normalized_value))
  const ownWebsite = (websites.find((c) => c.is_primary) ?? websites.sort((x, y) => (y.confidence ?? 0) - (x.confidence ?? 0))[0])?.normalized_value ?? null
  const emails = contacts.filter((c) => c.kind === 'email' && c.status !== 'INVALID' && !c.opted_out)
  const bestEmail =
    emails.find((c) => c.is_primary) ?? emails.find((c) => c.status === 'SOURCE_CONFIRMED') ?? emails.find((c) => c.status === 'UNVERIFIED') ?? null
  const emailStatus = (bestEmail?.status ?? (contacts.some((c) => c.kind === 'email') ? 'INVALID' : 'NONE')) as 'SOURCE_CONFIRMED' | 'UNVERIFIED' | 'INVALID' | 'NONE'
  const auditSummary: AuditSummary | null =
    audit && ownWebsite && domainOf(audit.url) === domainOf(ownWebsite)
      ? { reachable: !audit.error && audit.http_status !== null, httpStatus: audit.http_status, qualityScore: audit.quality_score, hasViewport: audit.has_viewport, httpsOk: audit.https_ok, copyrightYear: audit.copyright_year }
      : null
  const presence = classifyPresence({ ownWebsite, evidence: b.web_presence_evidence ?? [], audit: auditSummary })
  const settings = await getSettings()
  const confs = sources.map((s) => s.confidence).filter((c): c is number => c !== null)
  const res = computeScore(
    {
      presence,
      sector: b.sector,
      emailStatus,
      hasPhone: !!b.phone || contacts.some((c) => c.kind === 'phone'),
      hasAddress: !!b.address,
      hasCoordinates: b.lat !== null,
      sourceCount: new Set(sources.map((s) => s.source)).size,
      avgSourceConfidence: confs.length ? confs.reduce((a, c) => a + c, 0) / confs.length : null,
      operatingStatus: b.operating_status,
      pipelineStatus: b.pipeline_status,
      doNotContact: b.do_not_contact,
      explicitNeed: b.tags.includes('besoin-explicite'),
      hasSiret: !!b.siret,
    },
    settings.scoring,
    settings.targetSectors,
  )
  await db`
    update businesses set
      website_url = ${ownWebsite}, domain = ${ownWebsite ? domainOf(ownWebsite) : null},
      email = ${bestEmail?.normalized_value ?? null}, email_status = ${emailStatus},
      web_presence_status = ${presence}, score = ${res.score}, data_confidence = ${res.confidence}, priority = ${res.priority},
      pipeline_status = case when pipeline_status in ('NEW','DISCOVERED','ENRICHED') and ${res.score} >= 55 and enriched_at is not null then 'QUALIFIED' else pipeline_status end
    where id = ${businessId}`
  const [last] = await db<{ score: number; reasons: unknown }[]>`select score, reasons from prospect_scores where business_id = ${businessId} order by created_at desc limit 1`
  if (!last || last.score !== res.score || JSON.stringify(last.reasons) !== JSON.stringify(res.reasons)) {
    await db`insert into prospect_scores (business_id, score, confidence, priority, reasons, weights)
             values (${businessId}, ${res.score}, ${res.confidence}, ${res.priority}, ${db.json(res.reasons as never)}, ${db.json(settings.scoring as never)})`
  }
  return { score: res.score, presence }
}
