'use client'
import {useEffect,useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {BookOpen,ExternalLink,Loader2,Sparkles} from 'lucide-react'
import type {BusinessSummary,SummaryClaim} from '@/lib/business-summary'
import {api} from '@/lib/utils'
import {useJobRunner} from './use-job'
import {Button} from './ui/button'
import {Badge,Card,CardBody,CardHeader,Notice} from './ui/primitives'

export function SummaryPreview({summary}:{summary:BusinessSummary|null|undefined}){
 if(!summary)return <p className="mt-2 text-[11px] text-muted">Récapitulatif à enrichir</p>
 return <div className="mt-2 max-w-sm space-y-1.5 text-[11px] leading-5"><p className="line-clamp-2 text-muted">{summary.activity.text}</p>{summary.advantages.length?<p className="line-clamp-2 text-primary"><span className="font-medium">Avantages repérés : </span>{summary.advantages.slice(0,2).map(item=>item.text).join(' · ')}</p>:<p className="text-muted">Avantages non documentés</p>}</div>
}

export function BusinessSummaryCard({id,initial}:{id:string;initial:BusinessSummary|null}){
 const [busy,setBusy]=useState(false),runJob=useJobRunner()
 const query=useQuery({queryKey:['business-summary',id],queryFn:({signal})=>api<{summary:BusinessSummary|null;enriching:boolean}>(`/api/prospects/${id}/summary`,{signal}),refetchInterval:q=>busy||q.state.data?.enriching?3000:false})
 useEffect(()=>{void query.refetch()},[id,initial?.sourceHash])
 const summary=query.data?.summary??initial,enriching=busy||query.data?.enriching
 return <Card id="recap" className="scroll-mt-5"><CardHeader title="L’entreprise en bref" description="Son activité et les avantages annoncés ou indiqués dans les sources. Ils ne constituent pas une évaluation indépendante." actions={<Badge tone={summary?.coverage==='documented'?'success':'neutral'}>{summary?.coverage==='documented'?'Sources disponibles':summary?.coverage==='partial'?'Récap partiel':'Informations limitées'}</Badge>}/><CardBody className="space-y-5">
  {enriching?<p role="status" className="flex items-center gap-2 text-xs text-muted"><Loader2 className="size-4 animate-spin"/>Lecture des sources et mise à jour du récapitulatif…</p>:null}
  {query.error?<Notice tone="warning">Le récapitulatif n’a pas pu être actualisé. Vous pouvez réessayer.</Notice>:null}
  <div><h3 className="mb-2 text-sm font-medium">Ce qu’ils font</h3>{summary?<SummaryText claim={summary.activity}/>:<p className="text-sm leading-7 text-muted">Lancez l’enrichissement pour préparer le descriptif à partir des informations disponibles.</p>}</div>
  <div><h3 className="mb-3 text-sm font-medium">Leurs avantages repérés</h3>{summary?.advantages.length?<ul className="space-y-4">{summary.advantages.map((item,index)=><li key={index} className="border-l-2 border-primary/30 pl-4"><SummaryText claim={item}/></li>)}</ul>:<p className="text-sm leading-7 text-muted">Aucun avantage précis n’est documenté dans les sources disponibles. Ajoutez des informations publiques dans le brief ou relancez l’enrichissement.</p>}</div>
  {summary?.coverage==='limited'?<Notice title="Un descriptif reste à trouver">La fiche indique l’activité générale, mais aucune présentation détaillée publique n’a été trouvée. Le récapitulatif sera complété si l’enrichissement trouve un site ou si vous renseignez le brief.</Notice>:null}
  <details className="ui-details"><summary className="flex items-center gap-2"><BookOpen size={14}/>Voir les extraits et leurs sources</summary><div className="mt-4 space-y-4 text-xs">{summary?[summary.activity,...summary.advantages].flatMap(item=>item.evidence).filter((item,index,all)=>all.findIndex(other=>other.excerpt===item.excerpt&&other.url===item.url)===index).map((item,index)=><div key={index} className="space-y-2"><p className="break-words leading-6 text-muted">« {item.excerpt} »</p>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary">{item.label}<ExternalLink size={12}/></a>:<span className="text-muted">{item.label}</span>}</div>):<p className="text-muted">Aucun extrait disponible pour le moment.</p>}</div></details>
  <div className="flex flex-wrap items-center gap-3"><Button variant="outline" loading={!!enriching} className="max-w-full whitespace-normal" onClick={async()=>{setBusy(true);try{await runJob('Activité et avantages',async()=>{const started=await api<{jobId:string}>(`/api/prospects/${id}`,{method:'POST',json:{action:'enrich'}});void query.refetch();return started});await query.refetch()}finally{setBusy(false)}}}><Sparkles/>Enrichir l’activité et les avantages</Button>{summary?<span className="text-[11px] text-muted">Récap du {new Date(summary.updatedAt).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})}</span>:null}</div>
 </CardBody></Card>
}
function SummaryText({claim}:{claim:SummaryClaim}){return <div className="space-y-1"><p className="break-words text-sm leading-7">{claim.text}</p><p className="text-[11px] text-muted">{[...new Set(claim.evidence.map(item=>item.label))].join(' · ')}</p></div>}
