/** Verified facts about a business — the ONLY information a generated site/proposal may state. */
export interface BusinessFacts {
  businessId: string
  name: string
  sector: string | null
  sectorLabel: string
  templateId: string
  city: string | null
  address: string | null
  postcode: string | null
  phoneE164: string | null
  phoneDisplay: string | null
  email: string | null
  emailStatus: string
  lat: number | null
  lon: number | null
  socials: { network: string; url: string }[]
  openingHours: { lines: string[]; source: string } | null
  websiteStatus: string
  websiteUrl: string | null
  auditFindings: string[]
  /** extended dossier (optional: used by the bespoke generator) */
  categoryDetail?: string | null
  nafCode?: string | null
  creationYear?: number | null
  ownSite?: { url: string | null; title: string | null; description: string | null; text: string | null } | null
  sources?: string[]
  publicDetails?: string | null
  artDirection?: string | null
  verifiedDetails?: { field:string; value:unknown; source:string; url:string|null }[]
}
