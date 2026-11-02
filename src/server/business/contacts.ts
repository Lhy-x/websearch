import { sql } from '../core/db'
import { domainOf, isRoleEmail, normalizeEmail, normalizePhone, normalizeUrl, socialNetworkOf } from '../core/normalize'

export interface ContactInput {
  kind: 'email' | 'phone' | 'website' | 'social'
  value: string
  source: string
  sourceUrl?: string | null
  status?: 'SOURCE_CONFIRMED' | 'UNVERIFIED' | 'INVALID'
  confidence?: number | null
  country?: string | null
}

export function normalizeContact(c: ContactInput): string | null {
  switch (c.kind) {
    case 'email':
      return normalizeEmail(c.value)
    case 'phone':
      return normalizePhone(c.value, c.country ?? 'FR')
    case 'website':
    case 'social':
      return normalizeUrl(c.value)
  }
}

/** Insert a contact with provenance; existing rows keep the best status and get their retrieval date refreshed. */
export async function upsertContact(businessId: string, c: ContactInput): Promise<boolean> {
  const normalized = normalizeContact(c)
  if (!normalized) return false
  const kind = c.kind === 'website' && socialNetworkOf(normalized) ? 'social' : c.kind
  const label = kind === 'social' ? socialNetworkOf(normalized) : kind === 'website' ? domainOf(normalized) : null
  const db = sql()
  await db`
    insert into business_contacts (business_id, kind, value, normalized_value, label, source, source_url, status, confidence, is_role_account)
    values (${businessId}, ${kind}, ${c.value.slice(0, 500)}, ${normalized}, ${label}, ${c.source}, ${c.sourceUrl ?? null},
            ${c.status ?? 'UNVERIFIED'}, ${c.confidence ?? null}, ${kind === 'email' ? isRoleEmail(normalized) : null})
    on conflict (business_id, kind, normalized_value) do update set
      retrieved_at = now(),
      status = case when business_contacts.status = 'INVALID' then 'INVALID'
                    when excluded.status = 'SOURCE_CONFIRMED' then 'SOURCE_CONFIRMED' else business_contacts.status end,
      source_url = coalesce(business_contacts.source_url, excluded.source_url)`
  return true
}
