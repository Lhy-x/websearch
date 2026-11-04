import { randomUUID } from 'node:crypto'
import { sql } from '../core/db'
import { AppError } from '../core/errors'
import { aiAvailability } from '../ai/client'
import { getRuntimeConfig, getFlags } from '../core/settings'

export type GenerationMode = 'auto' | 'bespoke' | 'ai' | 'deterministic' | 'glass3d' | 'personalized'
export async function createGenerationBatch(ids: string[], options: { requestId?: string; generator?: GenerationMode; templateId?: string | null; style?: string | null } = {}) {
  const requestId = options.requestId ?? randomUUID(), generator = options.generator ?? 'personalized'
  const unique = [...new Set(ids)]
  if (!unique.length || unique.length > 2000) throw new AppError('Sélectionnez entre 1 et 2 000 prospects.', 400)
  if (['personalized','bespoke','ai'].includes(generator)) {
    const ai = await aiAvailability()
    if (!ai.available) throw new AppError('Connectez votre IA dans Paramètres → Mon IA pour créer des sites sur mesure. '+(ai.reason??''),400,'AI_REQUIRED')
  }
  return sql().begin(async tx => {
    const [created] = await tx`insert into generation_batches(request_id,requested_count) values(${requestId},${unique.length}) on conflict(request_id) do nothing returning id`
    if (!created) {
      const [existing] = await tx`select id from generation_batches where request_id=${requestId}`
      const [count] = await tx`select count(*)::int n from generation_batch_items where batch_id=${existing!.id}`
      return { batchId: existing!.id as string, queued: count!.n as number, reusedRequest: true }
    }
    const batchId = created.id as string
    // Lock businesses in a stable order so overlapping selections share already queued work.
    const businesses = await tx<{id:string;name:string;archived_at:Date|null;merged_into:string|null;do_not_contact:boolean}[]>`select id,name,archived_at,merged_into,do_not_contact from businesses where id=any(${unique}::uuid[]) order by id for update`
    const eligible=businesses.filter(row=>!row.archived_at&&!row.merged_into&&!row.do_not_contact)
    const names = new Map(eligible.map(row=>[row.id,row.name]))
    const skipped = unique.filter(id=>!names.has(id)).map(id=>({businessId:id,name:businesses.find(row=>row.id===id)?.name,reason:'Prospect introuvable, archivé, fusionné ou opposé.'}))
    await tx`update generation_batches set skipped=${tx.json(skipped)} where id=${batchId}`
    let queued = 0
    for (const [position, businessId] of unique.entries()) {
      if (!names.has(businessId)) continue
      const [active] = await tx`select id from automation_jobs where type='website.generate' and payload->>'businessId'=${businessId} and status in ('PENDING','RUNNING','RETRYING') order by created_at limit 1`
      let jobId = active?.id as string | undefined
      if (!jobId) {
        const [job] = await tx`insert into automation_jobs(type,payload,priority,max_attempts,idempotency_key) values('website.generate',${tx.json({businessId,batchId,generator,templateId:options.templateId??null,style:options.style??null})},40,2,${`generation:${requestId}:${businessId}`}) returning id`
        jobId = job!.id as string
      }
      await tx`insert into generation_batch_items(batch_id,business_id,business_name,position,job_id,reused) values(${batchId},${businessId},${names.get(businessId)!},${position},${jobId},${!!active})`
      queued++
    }
    return { batchId, queued, skipped, reusedRequest: false }
  })
}

export async function generationBatch(batchId: string, page = 1) {
  const db=sql(),size=40
  const [batch]=await db`select id,requested_count,skipped,created_at from generation_batches where id=${batchId}`
  if(!batch)throw new AppError('Lot de créations introuvable',404)
  const [summary]=await db`select count(*)::int total,count(*) filter(where j.status='COMPLETED')::int completed,count(*) filter(where j.status='RUNNING')::int running,count(*) filter(where j.status in ('PENDING','RETRYING'))::int pending,count(*) filter(where j.status='FAILED')::int failed,count(*) filter(where j.status='CANCELLED' or j.id is null)::int cancelled from generation_batch_items i left join automation_jobs j on j.id=i.job_id where i.batch_id=${batchId}`
  const pages=Math.max(1,Math.ceil(summary!.total/size)),current=Math.max(1,Math.min(Math.floor(page),pages))
  const items=await db`select i.business_id,i.business_name,i.position,i.job_id,i.reused,coalesce(j.status,'CANCELLED') status,j.progress,j.progress_message,j.error,j.run_at,case when w.deleted_at is null then w.id else null end website_id from generation_batch_items i left join automation_jobs j on j.id=i.job_id left join generated_websites w on w.id::text=j.result->>'websiteId' where i.batch_id=${batchId} order by i.position limit ${size} offset ${(current-1)*size}`
  const [runtime,flags,[worker]]=await Promise.all([getRuntimeConfig(),getFlags(),db`select last_seen_at from worker_heartbeats order by last_seen_at desc limit 1`])
  return {batch,summary,items,page:current,pages,concurrency:runtime.WORKER_CONCURRENCY,paused:flags.globalPause,workerOnline:!!worker&&Date.now()-new Date(worker.last_seen_at).getTime()<60000}
}

export async function recentGenerationBatches() {
  return sql()`select b.id,b.created_at,count(i.position)::int total,count(i.position) filter(where j.status='COMPLETED')::int completed,count(i.position) filter(where j.status in ('PENDING','RUNNING','RETRYING'))::int active,count(i.position) filter(where j.status='FAILED')::int failed from generation_batches b left join generation_batch_items i on i.batch_id=b.id left join automation_jobs j on j.id=i.job_id group by b.id order by b.created_at desc limit 12`
}

export async function changeGenerationBatch(batchId:string,action:'retry'|'cancel_pending',jobId?:string) {
  const [batch]=await sql()`select id from generation_batches where id=${batchId}`
  if(!batch)throw new AppError('Lot introuvable',404)
  const db=sql()
  const jobs=await db`select job_id from generation_batch_items where batch_id=${batchId} and (${jobId??null}::uuid is null or job_id=${jobId??null}::uuid)`
  const ids=jobs.map(row=>row.job_id).filter(Boolean)
  if(action==='retry')return {updated:(await db`update automation_jobs set status='PENDING',run_at=now(),error=null,progress=0,progress_message='Nouvelle tentative demandée',finished_at=null,max_attempts=greatest(max_attempts,attempts+1) where id=any(${ids}::uuid[]) and status in ('FAILED','CANCELLED') returning id`).length}
  return {updated:(await db`update automation_jobs set status='CANCELLED',finished_at=now(),progress_message='Attente annulée' where id=any(${ids}::uuid[]) and status in ('PENDING','RETRYING') returning id`).length}
}
