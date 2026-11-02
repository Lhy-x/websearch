import { sql } from '../core/db'
import { auditLog } from '../core/audit'
import { recomputeBusiness } from './recompute'

/** Manual merge of a duplicate into a primary record. Sources, contacts & history are preserved. */
export async function mergeBusinesses(primaryId: string, duplicateId: string, actor = 'admin') {
  if (primaryId === duplicateId) throw new Error('Impossible de fusionner une fiche avec elle-même')
  await sql().begin(async (tx) => {
    await tx`update business_sources set business_id = ${primaryId} where business_id = ${duplicateId}`
    await tx`insert into business_contacts (business_id, kind, value, normalized_value, label, source, source_url, status, mx_valid, is_role_account, opted_out, confidence, retrieved_at, verified_at)
             select ${primaryId}, kind, value, normalized_value, label, source, source_url, status, mx_valid, is_role_account, opted_out, confidence, retrieved_at, verified_at
             from business_contacts where business_id = ${duplicateId}
             on conflict (business_id, kind, normalized_value) do nothing`
    await tx`delete from business_contacts where business_id = ${duplicateId}`
    await tx`insert into business_enrichments (business_id, field, value, source, source_url, confidence, retrieved_at, verified_at)
             select ${primaryId}, field, value, source, source_url, confidence, retrieved_at, verified_at from business_enrichments where business_id = ${duplicateId}
             on conflict (business_id, field, source) do nothing`
    for (const t of ['website_audits', 'generated_websites', 'proposals', 'crm_notes', 'crm_tasks', 'crm_opportunities', 'conversations'] as const)
      await tx`update ${tx(t)} set business_id = ${primaryId} where business_id = ${duplicateId}`
    await tx`update businesses p set
               web_presence_evidence = p.web_presence_evidence || d.web_presence_evidence,
               siret = coalesce(p.siret, d.siret), siren = coalesce(p.siren, d.siren), naf_code = coalesce(p.naf_code, d.naf_code),
               phone = coalesce(p.phone, d.phone), address = coalesce(p.address, d.address), postcode = coalesce(p.postcode, d.postcode),
               tags = (select array(select distinct unnest(p.tags || d.tags)))
             from businesses d where p.id = ${primaryId} and d.id = ${duplicateId}`
    await tx`update businesses set merged_into = ${primaryId}, archived_at = now(), siret = null where id = ${duplicateId}`
    await tx`insert into business_merges (primary_id, candidate_id, score, status, decided_at, reasons)
             values (${primaryId}, ${duplicateId}, 1, 'MERGED', now(), '["Fusion manuelle"]'::jsonb)
             on conflict (primary_id, candidate_id) do update set status = 'MERGED', decided_at = now()`
  })
  await auditLog({ action: 'business.merge', entityType: 'business', entityId: primaryId, actor, data: { duplicateId } })
  await recomputeBusiness(primaryId)
}
