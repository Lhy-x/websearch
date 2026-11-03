'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, Check, CircleDot, Loader2, Search, Sparkles, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, fmtRelative } from '@/lib/utils'

interface Candidate { id: string; name: string; city: string | null; sector: string | null; score: number | null; web_presence_status: string; sites: number }
interface Job { id: string; status: string; error: string | null; created_at: string; result: { websiteId?: string } | null; name: string | null }
interface Availability { available: boolean; provider: string; reason?: string }

export function GeneratorClient({candidates,preselect,jobs,availability}:{candidates:Candidate[];preselect:string|null;jobs:Job[];availability:Availability}) {
  const router=useRouter()
  const [q,setQ]=useState('')
  const [busy,setBusy]=useState<string|null>(null)
  const [selected,setSelected]=useState(preselect ?? candidates[0]?.id ?? null)
  useEffect(()=>{if(jobs.some(j=>['PENDING','RUNNING','RETRYING'].includes(j.status))){const timer=setTimeout(()=>router.refresh(),3000);return()=>clearTimeout(timer)}},[jobs,router])
  const prospect=candidates.find(c=>c.id===selected)
  const visible=candidates.filter(c=>`${c.name} ${c.city??''}`.toLowerCase().includes(q.toLowerCase()))
  async function generate(id:string) {
    setBusy(id)
    try {await api('/api/prospects/'+id,{method:'POST',json:{action:'generate_site',generator:'personalized'}});toast.success('Création lancée : votre site est en cours de conception.');router.refresh()}
    catch(error){toast.error((error as Error).message)}finally{setBusy(null)}
  }
  return <div className="studio-page">
    <div className="studio-kicker"><span className="studio-live-dot"/> ATELIER CRÉATIF <span className="ml-auto text-muted">PROSPECTFORGE / 01</span></div>
    <section className="studio-hero">
      <div className="studio-hero-copy">
        <h1 className="text-sm font-medium text-muted">Générateur de sites</h1>
        <h2>Un prospect.<br/><span>Une identité.</span></h2>
        <p>Des sites qui ont quelque chose à dire. Une direction artistique, une sculpture de verre et un design conçus pour chaque entreprise.</p>
        <div className="studio-tags"><span><Check/> Sans template</span><span><Check/> Skill 3D intégré</span><span><Check/> Éditable et exportable</span></div>
      </div>
      <div className="studio-art" aria-hidden="true"><div className="studio-art-grid"/><div className="studio-orbit orbit-one"/><div className="studio-orbit orbit-two"/><div className="studio-orbit orbit-three"/><span className="studio-art-label">MATIÈRE. LUMIÈRE. MOUVEMENT.</span><span className="studio-art-index">3D / SUR MESURE</span></div>
    </section>
    <div className="studio-workspace">
      <section className="studio-prospects">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><span className="studio-step">01 / LE POINT DE DÉPART</span><h3 className="mt-2 text-xl font-semibold tracking-tight">Choisissez une entreprise</h3></div><span className="text-xs text-muted">{candidates.length} prospect{candidates.length>1?'s':''}</span></div>
        <label className="studio-search"><Search className="size-4 text-muted"/><input aria-label="Rechercher une entreprise" placeholder="Un nom, une ville…" value={q} onChange={e=>setQ(e.target.value)}/></label>
        <div className="studio-candidate-list">
          {visible.map(c=><div key={c.id} className={`studio-candidate ${selected===c.id?'is-selected':''}`}>
            <button className="min-w-0 flex-1 text-left" onClick={()=>setSelected(c.id)} aria-pressed={selected===c.id} aria-label={`Sélectionner ${c.name}`}><div className="flex items-center gap-3"><span className="studio-monogram">{c.name.slice(0,1).toUpperCase()}</span><div className="min-w-0"><span className="block truncate text-sm font-semibold">{c.name}</span><span className="mt-1 block text-xs text-muted">{c.city??'Ville non renseignée'} · {c.sites ? `${c.sites} site(s) créé(s)`:'Première création'}</span></div></div></button>
            <button className="studio-create-icon" disabled={!availability.available||!!busy} onClick={()=>generate(c.id)} aria-label={`Créer le site de ${c.name}`}>{busy===c.id?<Loader2 className="size-4 animate-spin"/>:<ArrowUpRight className="size-5"/>}</button>
          </div>)}
          {!visible.length?<div className="py-12 text-center text-sm text-muted">Aucune entreprise ici pour le moment.<br/><Link href="/search" className="mt-3 inline-block text-primary">Rechercher des prospects <ArrowUpRight className="inline size-3"/></Link></div>:null}
        </div>
      </section>
      <aside className="studio-brief">
        <span className="studio-step">02 / LA CRÉATION</span>
        <div className="studio-brief-icon"><WandSparkles className="size-6"/></div>
        <h3>{prospect?.name??'Votre prochain projet'}</h3>
        <p>Vous cliquez. L’IA fait le travail de direction artistique et compose un site original à partir des informations de l’entreprise.</p>
        <ol className="studio-pipeline"><li><span>01</span>Identité, textes et composition uniques</li><li><span>02</span>Silhouette 3D dessinée pour l’activité</li><li><span>03</span>Contrôle des faits et relecture visuelle</li></ol>
        <div className="studio-ai-status"><CircleDot className={`size-3 ${availability.available?'text-success':'text-warning'}`}/>{availability.available?`IA connectée · ${availability.provider}`:'Une connexion IA est nécessaire'}</div>
        {!availability.available?<div className="studio-connect"><p>{availability.reason??'Choisissez Claude ou Codex une première fois.'}</p><Button asChild className="w-full"><Link href="/settings">Connecter mon IA <ArrowUpRight/></Link></Button></div>:<Button className="studio-generate-button" size="lg" disabled={!selected||!!busy} loading={!!busy} onClick={()=>selected&&generate(selected)}><Sparkles/>Créer le site sur mesure <ArrowUpRight/></Button>}
        <p className="studio-fineprint">Aucun modèle de page prédéfini. La génération utilise votre abonnement ou votre fournisseur IA et son budget configuré.</p>
      </aside>
    </div>
    <section className="studio-recent"><div className="flex items-center justify-between"><div><span className="studio-step">VOTRE PRODUCTION</span><h3 className="mt-2 text-xl font-semibold tracking-tight">Les dernières créations</h3></div><Link href="/sites" className="flex items-center gap-2 text-xs font-medium text-muted">Tous les sites <ArrowUpRight className="size-4"/></Link></div>
      <div className="studio-job-list">{jobs.map(j=><div key={j.id} className="studio-job"><span className="studio-job-symbol">{['PENDING','RUNNING','RETRYING'].includes(j.status)?<Loader2 className="size-4 animate-spin"/>:<Sparkles className="size-4"/>}</span><div className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{j.name??'Création personnalisée'}</span><span className="text-xs text-muted">{j.error??({'PENDING':'En attente du worker','RUNNING':'En cours de conception','RETRYING':'Nouvelle tentative','COMPLETED':'Prêt à découvrir','FAILED':'La création a échoué'}[j.status]??j.status)}</span></div>{j.result?.websiteId?<Link className="studio-open-link" href={`/sites/${j.result.websiteId}`}>Découvrir <ArrowUpRight className="size-4"/></Link>:<span className="text-xs text-muted">{fmtRelative(j.created_at)}</span>}</div>)}{!jobs.length?<p className="py-8 text-sm text-muted">Votre première création apparaîtra ici.</p>:null}</div>
    </section>
  </div>
}
