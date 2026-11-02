import { TransientError } from '../core/errors'
import { haversineKm } from '../core/geo'
import { getSettings } from '../core/settings'
import { SECTOR_BY_ID, sectorFromNaf } from '@/lib/sectors'
import type { Connector, RawPlace, SearchQuery } from './types'

/**
 * French company registry (Sirene) through the free government API "recherche-entreprises.api.gouv.fr"
 * (no key, ~7 req/s). Uses /near_point for geographic search filtered by NAF code.
 * Only "diffusible" establishments are returned by the API; we keep its fields as-is.
 */
const BASE = 'https://recherche-entreprises.api.gouv.fr'

interface Etab {
  siret: string
  activite_principale?: string
  adresse?: string
  code_postal?: string
  libelle_commune?: string
  latitude?: string | number
  longitude?: string | number
  etat_administratif?: string
  date_creation?: string
  nom_commercial?: string | null
  liste_enseignes?: string[] | null
  est_siege?: boolean
}
interface Company {
  siren: string
  nom_complet?: string
  nom_raison_sociale?: string
  activite_principale?: string
  date_creation?: string
  etat_administratif?: string
  nature_juridique?: string
  tranche_effectif_salarie?: string | null
  siege?: Etab
  matching_etablissements?: Etab[]
}

export function mapCompany(c: Company, q: Pick<SearchQuery, 'lat' | 'lon' | 'radiusKm'>): RawPlace[] {
  const etabs = c.matching_etablissements?.length ? c.matching_etablissements : c.siege ? [c.siege] : []
  const out: RawPlace[] = []
  for (const e of etabs) {
    if (e.etat_administratif && e.etat_administratif !== 'A') continue
    const lat = e.latitude != null ? Number(e.latitude) : null
    const lon = e.longitude != null ? Number(e.longitude) : null
    if (lat !== null && lon !== null && haversineKm(q.lat, q.lon, lat, lon) > q.radiusKm) continue
    const enseigne = e.liste_enseignes?.[0] || e.nom_commercial
    const name = (enseigne || c.nom_complet || c.nom_raison_sociale || '').trim()
    if (!name) continue
    const naf = e.activite_principale || c.activite_principale || null
    out.push({
      source: 'recherche_entreprises',
      sourceRecordId: e.siret,
      license: 'Licence Ouverte 2.0 (Etalab)',
      name: titleCase(name),
      sector: sectorFromNaf(naf, name),
      sourceCategory: naf,
      address: e.adresse ?? null,
      postcode: e.code_postal ?? null,
      city: e.libelle_commune ?? null,
      region: null,
      country: 'FR',
      lat,
      lon,
      phones: [],
      websites: [],
      emails: [],
      socials: [],
      siren: c.siren,
      siret: e.siret,
      naf,
      operatingStatus: 'open',
      confidence: 0.9,
      raw: { nature_juridique: c.nature_juridique, date_creation: e.date_creation ?? c.date_creation, tranche_effectif: c.tranche_effectif_salarie, est_siege: e.est_siege, raison_sociale: c.nom_raison_sociale },
    })
  }
  return out
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
}

async function getJson(url: string, attempt = 0): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (res.status === 429) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      return getJson(url, attempt + 1)
    }
    throw new TransientError('recherche-entreprises : limite de débit atteinte', 60_000)
  }
  if (res.status >= 500) throw new TransientError(`recherche-entreprises HTTP ${res.status}`)
  if (!res.ok) throw new Error(`recherche-entreprises HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export const rechercheEntreprisesConnector: Connector = {
  id: 'recherche_entreprises',
  label: 'Sirene (API Recherche d’entreprises)',
  async status() {
    const s = await getSettings()
    return { configured: true, enabled: s.search.sources.recherche_entreprises, message: 'API publique gratuite (France uniquement)' }
  },
  async search(q, log) {
    if (q.country !== 'FR') return []
    const sector = q.sector ? SECTOR_BY_ID.get(q.sector) : null
    if (!sector && !q.keywords) {
      await log('Sirene : ignoré (secteur ou mots-clés requis pour une recherche géographique)')
      return []
    }
    const radius = Math.min(q.radiusKm, 50)
    const out: RawPlace[] = []
    const nafs = sector?.naf.length ? sector.naf : [null]
    for (const naf of nafs) {
      for (let page = 1; page <= 20 && out.length < q.maxResults; page++) {
        const params = new URLSearchParams({ lat: String(q.lat), long: String(q.lon), radius: String(radius), per_page: '25', page: String(page), etat_administratif: 'A' })
        if (naf) params.set('activite_principale', naf)
        const data = (await getJson(`${BASE}/near_point?${params}`)) as { results?: Company[]; total_pages?: number }
        for (const c of data.results ?? []) {
          for (const p of mapCompany(c, { ...q, radiusKm: q.radiusKm })) {
            if (q.sector === 'barber' && p.sector !== 'barber') continue
            if (q.keywords && !p.name.toLowerCase().includes(q.keywords.toLowerCase()) && sector == null) continue
            out.push(p)
          }
        }
        if (!data.total_pages || page >= data.total_pages) break
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    await log(`Sirene : ${out.length} établissements actifs`)
    return out.slice(0, q.maxResults)
  },
}
