'use client'
import Link from 'next/link'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { useState,useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { FlaskConical,Check,ArrowRight,ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/utils'
import { Button } from './ui/button'
import { Card,CardBody,CardHeader,Notice,Badge } from './ui/primitives'
type Readiness={mode:'test'|'live';ready:boolean;checks:{id:string;label:string;ok:boolean;href:string}[];emailProvider:string;hostingEnabled:boolean}
const noop=()=>()=>{}
/** false on the server and while hydrating, true afterwards: lets cached client data render without a hydration mismatch. */
function useHydrated(){return useSyncExternalStore(noop,()=>true,()=>false)}
/** The readiness query is shared with the banner: it can already be cached when this panel hydrates. */
function useReadiness(refetchInterval?:number){
  const query=useQuery({queryKey:['launch-mode'],queryFn:()=>api<Readiness>('/api/launch'),refetchInterval})
  const hydrated=useHydrated()
  return hydrated?query:{...query,data:undefined,error:null}
}
export function LaunchModePanel({onChanged}:{onChanged?:(mode:'test'|'live')=>void}){
  const cache=useQueryClient(),router=useRouter(),[busy,setBusy]=useState(false)
  const query=useReadiness()
  async function change(mode:'test'|'live'){setBusy(true);try{const next=await api<Readiness>('/api/launch',{method:'POST',json:{mode}});cache.setQueryData(['launch-mode'],next);onChanged?.(mode);router.refresh();toast.success(mode==='live'?'Mode production activé':'Mode test activé')}catch(error){toast.error((error as Error).message)}finally{setBusy(false)}}
  return <Card id="launch-mode"><CardHeader title="Du test à la production" description="Un seul bouton pour activer les nouvelles ventes et publications réelles, après vérification de votre configuration." actions={<Badge tone={query.data?.mode==='live'?'success':'warning'}>{query.data?.mode==='live'?'Production':'Mode test'}</Badge>}/><CardBody className="space-y-5">{query.error?<Notice tone="danger">{query.error.message}</Notice>:null}<Notice title="Pendant vos essais">Les commandes créées en test restent des essais Stripe et leur publication o2switch est simulée. Les fichiers ZIP et les aperçus sont disponibles pour vérifier le parcours. Les clés Stripe de test et réelles sont séparées.</Notice><div className="space-y-2">{query.data?.checks.map(check=><Link href={check.href} key={check.id} className="flex items-center gap-3 rounded-xl border border-border p-3 text-xs"><span className={check.ok?'text-success':'text-warning'}>{check.ok?<Check size={16}/>:<ArrowRight size={16}/>}</span><span className="flex-1">{check.label}</span><span className="text-muted">{check.ok?'Prêt':'Configurer'}</span></Link>)}</div><p className="text-xs leading-6 text-muted">Le contrôle valide aussi la clé réelle auprès de Stripe. Votre application publique et son moteur doivent rester disponibles pour recevoir les paiements et lancer les publications. Le prix mensuel se règle dans Hébergement. Les contrats réels existants restent gérés si vous revenez tester de nouveaux parcours.</p>{query.data?.mode==='live'?<Button variant="outline" loading={busy} onClick={()=>change('test')}><FlaskConical/>Revenir au mode test</Button>:<Button className="h-auto min-h-11 max-w-full whitespace-normal py-3 text-center leading-6" loading={busy} disabled={!query.data?.ready} onClick={()=>change('live')}><ShieldCheck/>Désactiver le mode test et passer en production</Button>}</CardBody></Card>
}
export function LaunchModeBanner(){const query=useReadiness(30000);if(query.data?.mode!=='test')return null;return <div className="system-banner bg-warning/8 text-warning"><FlaskConical className="size-4 shrink-0"/><p>Mode test · nouvelles ventes et publications simulées, envois email en simulation.</p><Link href="/settings?tab=general#launch-mode">Passer en production<ArrowRight size={14}/></Link></div>}
