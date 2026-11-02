import { sql } from '../core/db'
import { formatPhoneNational } from '../core/normalize'
import { SECTOR_BY_ID } from '@/lib/sectors'
import type { BusinessFacts } from '@/lib/site/facts'

const OSM_DAYS: Record<string, string> = { Mo: 'Lundi', Tu: 'Mardi', We: 'Mercredi', Th: 'Jeudi', Fr: 'Vendredi', Sa: 'Samedi', Su: 'Dimanche', PH: 'Jours fériés' }

/** Convert a simple OSM opening_hours value into human lines; returns null for complex syntaxes. */
export function osmHoursToLines(v: string): string[] | null {
  if (!v || v.length > 300 || /[\[\]"]|sunrise|sunset|week|easter/.test(v)) return null
  const parts = v.split(';').map((p) => p.trim()).filter(Boolean)
  const lines: string[] = []
  for (const p of parts) {
    const m = p.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*)\s+(.+)$/)
    if (!m) return null
    const days = m[1]!.replace(/(Mo|Tu|We|Th|Fr|Sa|Su|PH)/g, (d) => OSM_DAYS[d]!).replace(/-/g, ' – ').replace(/,/g, ', ')
    const hours = m[2]!.trim() === 'off' ? 'Fermé' : m[2]!.replace(/-/g, ' – ').replace(/,/g, ', ')
    lines.push(`${days} : ${hours}`)
  }
  return lines.length ? lines : null
}

export async function loadBusinessFacts(businessId: string): Promise<BusinessFacts> {
  const db = sql()
  const [b] = await db<{ id: string; name: string; sector: string | null; city: string | null; address: string | null; postcode: string | null; phone: string | null; email: string | null; email_status: string; lat: number | null; lon: number | null; web_presence_status: string; website_url: string | null }[]>`
    select id, name, sector, city, address, postcode, phone, email, email_status, lat, lon, web_presence_status, website_url from businesses where id = ${businessId}`
  if (!b) throw new Error('Prospect introuvable')
  const socials = await db<{ label: string | null; normalized_value: string }[]>`
    select label, normalized_value from business_contacts where business_id = ${businessId} and kind = 'social' and status <> 'INVALID' limit 6`
  const osm = await db<{ raw: { opening_hours?: string | null } }[]>`select raw from business_sources where business_id = ${businessId} and source = 'osm' limit 1`
  const hoursEnr = await db<{ value: { lines: string[] }; source: string }[]>`
    select value, source from business_enrichments where business_id = ${businessId} and field = 'opening_hours' order by verified_at desc nulls last limit 1`
  let openingHours: BusinessFacts['openingHours'] = null
  if (hoursEnr[0]?.value?.lines?.length) openingHours = { lines: hoursEnr[0].value.lines, source: hoursEnr[0].source }
  else if (osm[0]?.raw?.opening_hours) {
    const lines = osmHoursToLines(osm[0].raw.opening_hours)
    if (lines) openingHours = { lines, source: 'OpenStreetMap (à confirmer par l’établissement)' }
  }
  const [audit] = await db<{ issues: { label: string; severity: string }[] }[]>`select issues from website_audits where business_id = ${businessId} order by created_at desc limit 1`
  const [extra] = await db<{ source_category: string | null; naf_code: string | null }[]>`select source_category, naf_code from businesses where id = ${businessId}`
  const srcs = await db<{ source: string; raw: { date_creation?: string } }[]>`select source, raw from business_sources where business_id = ${businessId}`
  const creation = srcs.find((x) => x.source === 'recherche_entreprises')?.raw?.date_creation
  const enr = await db<{ field: string; value: { title?: string | null; description?: string | null; text?: string } ; source_url: string | null }[]>`
    select field, value, source_url from business_enrichments where business_id = ${businessId} and field in ('website_meta','website_text')`
  const meta = enr.find((e) => e.field === 'website_meta')
  const siteText = enr.find((e) => e.field === 'website_text')
  const sector = b.sector ? SECTOR_BY_ID.get(b.sector) : undefined
  return {
    businessId: b.id,
    name: b.name,
    sector: b.sector,
    sectorLabel: sector?.label ?? 'Commerce local',
    templateId: sector?.templateId ?? 'generique',
    city: b.city,
    address: b.address,
    postcode: b.postcode,
    phoneE164: b.phone,
    phoneDisplay: formatPhoneNational(b.phone),
    email: b.email_status === 'INVALID' ? null : b.email,
    emailStatus: b.email_status,
    lat: b.lat,
    lon: b.lon,
    socials: socials.map((s) => ({ network: s.label ?? 'réseau', url: s.normalized_value })),
    openingHours,
    websiteStatus: b.web_presence_status,
    websiteUrl: b.website_url,
    auditFindings: (audit?.issues ?? []).filter((i) => i.severity !== 'info').map((i) => i.label).slice(0, 6),
    categoryDetail: extra?.source_category ?? null,
    nafCode: extra?.naf_code ?? null,
    creationYear: creation && /^\d{4}/.test(creation) ? Number(creation.slice(0, 4)) : null,
    ownSite: meta || siteText ? { url: b.website_url, title: meta?.value.title ?? null, description: meta?.value.description ?? null, text: siteText?.value.text ?? null } : null,
    sources: [...new Set(srcs.map((x) => x.source))],
  }
}
