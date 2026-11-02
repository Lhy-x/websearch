export type SourceId = 'overture' | 'recherche_entreprises' | 'osm' | 'google_places' | 'import' | 'manual'

export interface SearchQuery {
  country: 'FR' | 'BE' | 'CH'
  lat: number
  lon: number
  radiusKm: number
  sector?: string | null
  keywords?: string | null
  city?: string | null
  postcode?: string | null
  maxResults: number
}

/** A place as returned by one source, before deduplication. Only facts the source actually provided. */
export interface RawPlace {
  source: SourceId
  sourceRecordId: string
  sourceRelease?: string
  license?: string
  name: string
  sector: string | null
  sourceCategory: string | null
  address: string | null
  postcode: string | null
  city: string | null
  region: string | null
  country: string | null
  lat: number | null
  lon: number | null
  phones: string[]
  websites: string[]
  emails: string[]
  socials: string[]
  siren?: string | null
  siret?: string | null
  naf?: string | null
  operatingStatus?: string | null
  confidence?: number | null
  raw: Record<string, unknown>
}

export interface ConnectorStatus {
  configured: boolean
  enabled: boolean
  message: string
}

export interface ConnectorReport {
  source: SourceId
  status: 'ok' | 'skipped' | 'error'
  count: number
  ms: number
  message?: string
}

export interface Connector {
  id: SourceId
  label: string
  status(): Promise<ConnectorStatus>
  search(q: SearchQuery, log: (msg: string) => Promise<void> | void): Promise<RawPlace[]>
}
