import { aiAvailability } from '@/server/ai/client'
import { sql } from '@/server/core/db'
import { GeneratorClient } from './client'
import { GenerationBatch } from '@/components/generation-batch'
import { recentGenerationBatches } from '@/server/sites/batches'
import Link from 'next/link'
import { z } from 'zod'
import { PageHeader } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Générateur de sites' }
export const dynamic = 'force-dynamic'

export default async function GeneratorPage({ searchParams }: { searchParams: Promise<{ business?: string; batch?:string }> }) {
  const sp = await searchParams
  const candidates = await sql()<{ id: string; name: string; city: string | null; sector: string | null; score: number | null; web_presence_status: string; sites: number }[]>`
    select b.id, b.name, b.city, b.sector, b.score, b.web_presence_status,
      (select count(*)::int from generated_websites g where g.business_id = b.id and g.deleted_at is null and g.status = 'READY') sites
    from businesses b where b.merged_into is null and b.archived_at is null and not b.do_not_contact
      and (${sp.business ?? null}::uuid is null or b.id = ${sp.business ?? null}::uuid)
    order by (b.id = ${sp.business ?? null}::uuid) desc nulls last, sites asc, b.score desc nulls last limit 100`
  const jobs = await sql()<{ id: string; status: string; payload: { businessId: string }; error: string | null; created_at: Date; result: { websiteId?: string } | null; name: string | null }[]>`
    select j.id, j.status, j.payload, j.error, j.created_at, case when exists(select 1 from generated_websites w where w.id::text=j.result->>'websiteId' and w.deleted_at is null) then j.result else null end result, b.name from automation_jobs j left join businesses b on b.id = (j.payload->>'businessId')::uuid
    where j.type = 'website.generate' order by j.created_at desc limit 15`
  const availability = await aiAvailability()
  const batches=await recentGenerationBatches()
  const selectedBatch=z.string().uuid().safeParse(sp.batch)
  return (
    <>

      {selectedBatch.success?<><PageHeader title="Suivi des créations" description="Chaque entreprise, chaque étape, au même endroit." actions={<Button variant="outline" asChild><Link href="/generator">Créer un autre site</Link></Button>}/><GenerationBatch key={selectedBatch.data} id={selectedBatch.data}/></>:<>{batches.length?<div className="mb-6 flex flex-wrap gap-2">{batches.slice(0,4).map(batch=><Link key={batch.id} className="rounded-xl border border-border bg-panel px-4 py-3 text-xs" href={`/generator?batch=${batch.id}`}>Lot · {batch.completed}/{batch.total} prêts{batch.active?` · ${batch.active} en attente ou en cours`:''}</Link>)}</div>:null}<GeneratorClient availability={availability} candidates={candidates} preselect={sp.business ?? null} jobs={jobs.map((j) => ({ ...j, created_at: j.created_at.toISOString() }))} /></>}
    </>
  )
}
