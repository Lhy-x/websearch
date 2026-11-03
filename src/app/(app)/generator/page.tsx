import { aiAvailability } from '@/server/ai/client'
import { sql } from '@/server/core/db'
import { GeneratorClient } from './client'

export const metadata = { title: 'Générateur de sites' }
export const dynamic = 'force-dynamic'

export default async function GeneratorPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const sp = await searchParams
  const candidates = await sql()<{ id: string; name: string; city: string | null; sector: string | null; score: number | null; web_presence_status: string; sites: number }[]>`
    select b.id, b.name, b.city, b.sector, b.score, b.web_presence_status,
      (select count(*)::int from generated_websites g where g.business_id = b.id and g.deleted_at is null and g.status = 'READY') sites
    from businesses b where b.merged_into is null and b.archived_at is null and not b.do_not_contact
      and (${sp.business ?? null}::uuid is null and b.score >= 35 or b.id = ${sp.business ?? null}::uuid)
    order by (b.id = ${sp.business ?? null}::uuid) desc nulls last, sites asc, b.score desc nulls last limit 100`
  const jobs = await sql()<{ id: string; status: string; payload: { businessId: string }; error: string | null; created_at: Date; result: { websiteId?: string } | null; name: string | null }[]>`
    select j.id, j.status, j.payload, j.error, j.created_at, j.result, b.name from automation_jobs j left join businesses b on b.id = (j.payload->>'businessId')::uuid
    where j.type = 'website.generate' order by j.created_at desc limit 15`
  const availability = await aiAvailability()
  return (
    <>

      <GeneratorClient availability={availability} candidates={candidates} preselect={sp.business ?? null} jobs={jobs.map((j) => ({ ...j, created_at: j.created_at.toISOString() }))} />
    </>
  )
}
