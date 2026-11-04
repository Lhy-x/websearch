'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Loader2, RotateCcw, Square, Layers3 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/utils'
import { Button } from './ui/button'
import { Badge, Card, CardBody, CardHeader, Notice } from './ui/primitives'

interface BatchData {
  batch:{id:string;requested_count:number;skipped:{businessId:string;name?:string;reason:string}[]}
  summary:{total:number;completed:number;running:number;pending:number;failed:number;cancelled:number}
  items:{business_id:string|null;business_name:string;job_id:string|null;status:string;progress:number;progress_message:string|null;error:string|null;website_id:string|null;reused:boolean}[]
  page:number;pages:number;concurrency:number;paused:boolean;workerOnline:boolean
}
const LABELS:Record<string,string>={PENDING:'En attente',RUNNING:'En création',RETRYING:'Nouvelle tentative planifiée',COMPLETED:'Site prêt',FAILED:'À reprendre',CANCELLED:'Annulé'}
export function GenerationBatch({id}:{id:string}) {
  const [page,setPage]=useState(1),[busy,setBusy]=useState(false)
  const query=useQuery({queryKey:['generation-batch',id,page],queryFn:()=>api<BatchData>(`/api/generation-batches/${id}?page=${page}`),refetchInterval:q=>q.state.data&&q.state.data.summary.pending+q.state.data.summary.running===0?false:2500})
  async function action(action:'retry'|'cancel_pending',jobId?:string){setBusy(true);try{const result=await api<{updated:number}>(`/api/generation-batches/${id}`,{method:'POST',json:{action,jobId}});toast.success(`${result.updated} tâche(s) ${action==='retry'?'remise(s) en attente':'annulée(s)'}`);await query.refetch()}catch(error){toast.error((error as Error).message)}finally{setBusy(false)}}
  if(query.error)return <Notice tone="danger" title="Suivi indisponible">{query.error.message}<Button variant="outline" className="mt-3" onClick={()=>query.refetch()}>Réessayer</Button></Notice>
  if(!query.data)return <Card><CardBody><p role="status" className="flex items-center gap-3 text-sm text-muted"><Loader2 className="size-4 animate-spin"/>Chargement du lot de créations…</p></CardBody></Card>
  const data=query.data,s=data.summary,active=s.pending+s.running
  return <Card className="mb-7 border-primary/25" id="creation-batch"><CardHeader title="Votre lot de créations" description={`${s.total} prospect(s) enregistré(s) sur ${data.batch.requested_count} sélectionné(s). Les créations restent visibles après rechargement.`} actions={<Badge tone={active?'info':s.failed?'warning':'success'}>{s.completed}/{s.total} prêts</Badge>}/><CardBody className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['En attente',s.pending],['En création',s.running],['Prêts',s.completed],['À reprendre',s.failed]].map(([label,value])=><div key={String(label)} className="rounded-2xl bg-panel-2 p-4"><strong className="block text-2xl tabular">{value}</strong><span className="text-xs text-muted">{label}</span></div>)}</div>
    <progress aria-label="Sites prêts dans ce lot" max={Math.max(1,s.total)} value={s.completed} className="h-2 w-full accent-primary"/>
    <p className="text-xs leading-6 text-muted">Le moteur lance jusqu’à {data.concurrency} tâches en parallèle. Les autres attendent leur tour ; le nombre en attente ne signifie pas qu’elles sont oubliées.</p>
    {data.paused?<Notice tone="warning" title="Les automatisations sont en pause"><Link href="/automations" className="underline">Reprendre depuis les automatisations</Link>.</Notice>:active&&!data.workerOnline?<Notice tone="warning" title="Le moteur n’a pas été détecté récemment">Gardez LANCER-MAC.command ouvert pour exécuter toutes les créations. Les tâches restent enregistrées en attendant.</Notice>:null}
    {data.batch.skipped.length?<details className="ui-details"><summary>{data.batch.skipped.length} prospect(s) non lancé(s) — voir les raisons</summary><ul className="space-y-2 text-xs text-muted">{data.batch.skipped.map(item=><li key={item.businessId}>{item.name??item.businessId.slice(0,8)} : {item.reason}</li>)}</ul></details>:null}
    <div className="divide-y divide-border">{data.items.map(item=><div key={item.job_id??item.business_id??item.business_name} className="flex flex-wrap items-start gap-3 py-4"><span className="mt-1 text-primary">{item.status==='RUNNING'?<Loader2 className="size-4 animate-spin"/>:item.status==='COMPLETED'?<Check size={17}/>:<Layers3 size={17}/>}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.business_name}</p><p className="mt-1 text-xs text-muted">{LABELS[item.status]??item.status}{item.reused?' · création déjà en cours réutilisée':''}</p>{item.progress_message&&item.status==='RUNNING'?<p role="status" className="mt-2 text-xs leading-6 text-muted">{item.progress_message}</p>:null}{item.error?<p className="mt-2 break-words text-xs leading-6 text-danger">{item.error}</p>:null}</div>{item.website_id&&item.status==='COMPLETED'?<Button size="sm" variant="outline" asChild><Link href={`/sites/${item.website_id}`}>Ouvrir le site<ArrowUpRight/></Link></Button>:['FAILED','CANCELLED'].includes(item.status)&&item.job_id?<Button size="sm" variant="outline" disabled={busy} onClick={()=>action('retry',item.job_id!)}><RotateCcw/>Réessayer</Button>:null}</div>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2">{s.failed+s.cancelled>0?<Button size="sm" variant="outline" disabled={busy} onClick={()=>action('retry')}><RotateCcw/>Reprendre les échecs</Button>:null}{s.pending>0?<Button size="sm" variant="ghost" disabled={busy} onClick={()=>action('cancel_pending')}><Square/>Annuler l’attente</Button>:null}</div><div className="flex items-center gap-2 text-xs text-muted"><Button size="icon" variant="outline" aria-label="Page précédente du lot" disabled={data.page<=1} onClick={()=>setPage(page-1)}><ChevronLeft/></Button>{data.page} / {data.pages}<Button size="icon" variant="outline" aria-label="Page suivante du lot" disabled={data.page>=data.pages} onClick={()=>setPage(page+1)}><ChevronRight/></Button></div></div>
  </CardBody></Card>
}

export function GenerationActivity() {
  const query=useQuery({queryKey:['generation-batches'],queryFn:()=>api<{activeCount:number;batches:{id:string;total:number;active:number;completed:number;failed:number}[]}>('/api/generation-batches'),refetchInterval:6000})
  const active=query.data?.batches.filter(batch=>batch.active>0)??[]
  const total=query.data?.activeCount??0
  if(!total)return null
  return <div className="system-banner bg-primary/6"><Loader2 className="size-4 shrink-0 animate-spin"/><p>{total} création(s) en cours ou en attente.</p><Link href={active.length?`/generator?batch=${active[0]!.id}`:'/generator'}>Voir l’avancement<ArrowUpRight size={14}/></Link></div>
}
