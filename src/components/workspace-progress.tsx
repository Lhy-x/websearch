'use client'
import Link from 'next/link'
import { createContext,useContext,useEffect,useRef,useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { Check,ChevronRight,Trophy,Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/utils'
import type { WorkspaceProgress } from '@/lib/workspace-progress'
import { Dialog } from './ui/dialog'
import { Card,CardBody,CardHeader,Badge } from './ui/primitives'
const Context=createContext<WorkspaceProgress|null>(null)
export function WorkspaceProgressProvider({initial,children}:{initial:WorkspaceProgress;children:React.ReactNode}){
 const path=usePathname(),previous=useRef(initial.xp)
 const query=useQuery({queryKey:['workspace-progress',initial.epoch],queryFn:()=>api<WorkspaceProgress>('/api/progress'),initialData:initial,refetchInterval:30000})
 useEffect(()=>{void query.refetch()},[path])
 useEffect(()=>{if(query.data.xp>previous.current)toast.success(`Objectif atteint · +${query.data.xp-previous.current} XP`,{description:'Une étape réelle de votre atelier vient d’être validée.'});previous.current=query.data.xp},[query.data.xp])
 return <Context.Provider value={query.data}>{children}</Context.Provider>
}
export function WorkspaceLevel(){
 const data=useContext(Context),[open,setOpen]=useState(false)
 if(!data)return null
 const percentage=data.nextXp?Math.min(100,100*(data.xp-data.levelStart)/(data.nextXp-data.levelStart)):100
 return <><button className="workspace-level" onClick={()=>setOpen(true)} aria-label={`Votre progression : niveau ${data.level}, ${data.xp} XP`}><span className="flex items-center gap-2 text-primary"><Trophy size={16}/><strong>Niveau {data.level} · {data.levelName}</strong><small className="ml-auto">{data.xp} XP</small></span><span className="workspace-level-track"><span style={{width:`${percentage}%`}}/></span><span className="flex items-center justify-between text-muted"><small>{data.nextXp?`${data.nextXp-data.xp} XP avant le prochain niveau`:'Parcours maîtrisé'}</small><ChevronRight size={13}/></span></button><Dialog open={open} onOpenChange={setOpen} title="Votre progression" description="Des objectifs réels pour construire votre atelier, sans points pour les clics ni les doublons." wide><div className="space-y-3">{data.missions.map(mission=><Link key={mission.code} href={mission.href} onClick={()=>setOpen(false)} className="flex items-start gap-3 rounded-2xl border border-border p-4"><span className={mission.done?'text-success':'text-muted'}>{mission.done?<Check size={18}/>:<Sparkles size={18}/>}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{mission.title}</strong><small className="mt-1 block text-xs leading-6 text-muted">{mission.description}</small></span><Badge tone={mission.done?'success':'neutral'}>{mission.done?'Validé':`${mission.current}/${mission.target}`} · {mission.xp} XP</Badge></Link>)}</div></Dialog></>
}
export function WorkspaceMissions(){const data=useContext(Context);if(!data)return null;const next=data.missions.filter(mission=>mission.main&&!mission.done).slice(0,3);return <Card className="mb-6"><CardHeader title="Votre prochaine progression" description={`Niveau ${data.level} · ${data.levelName} · ${data.xp} XP. Les objectifs validés sont conservés jusqu’à la remise à zéro de l’espace.`} actions={<Trophy size={23} className="text-primary"/>}/><CardBody className="grid gap-4 md:grid-cols-3">{next.length?next.map(mission=><Link href={mission.href} key={mission.code} className="rounded-2xl border border-border bg-panel-2 p-5 transition-colors hover:border-primary/30"><span className="mb-4 inline-flex rounded-full bg-primary/8 p-2 text-primary"><Sparkles size={16}/></span><h3 className="text-sm font-medium">{mission.title}</h3><p className="mt-2 text-xs leading-6 text-muted">{mission.description}</p><span className="mt-4 flex items-center justify-between text-xs text-primary">+{mission.xp} XP<ChevronRight size={14}/></span></Link>):<p className="text-sm leading-7 text-muted md:col-span-3">Votre parcours principal est validé. Continuez à accompagner vos clients et à concevoir leurs sites sur mesure.</p>}</CardBody></Card>}
