'use client'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input, Select } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { SECTORS } from '@/lib/sectors'
import { PIPELINE, PRESENCE } from '@/lib/labels'

export function ProspectFilters() {
  const router = useRouter(), path = usePathname(), sp = useSearchParams()
  const update = (k: string, v: string) => { const q = new URLSearchParams(sp); if (v) q.set(k, v); else q.delete(k); q.delete('page'); router.push(`${path}?${q}`) }
  const active = ['presence','pipeline','minScore','requireEmail','archived'].filter(k=>sp.get(k)&&sp.get(k)!=='false').length
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3"><form className="relative min-w-0 flex-1 basis-56" onSubmit={e => { e.preventDefault(); update('q', String(new FormData(e.currentTarget).get('q') ?? '')) }}><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted"/><Input key={sp.get('q')??''} name="q" defaultValue={sp.get('q') ?? ''} placeholder="Nom, ville ou email…" aria-label="Recherche" className="bg-panel pl-10 pr-20"/><button className="absolute right-2 top-2 rounded-full bg-panel-2 px-3 py-1.5 text-[10px] font-medium" type="submit">Chercher</button></form>
      <Select className="w-full bg-panel sm:w-44" value={sp.get('sector') ?? ''} onChange={e=>update('sector',e.target.value)} aria-label="Secteur"><option value="">Toutes les activités</option>{SECTORS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</Select>
      <Select className="w-full bg-panel sm:w-40" value={sp.get('sort')??'score'} onChange={e=>update('sort',e.target.value)} aria-label="Tri"><option value="score">Priorité de contact</option><option value="created">Plus récents</option><option value="name">Nom</option><option value="city">Ville</option><option value="confidence">Fiabilité des données</option></Select>
      {[...sp.keys()].some(k=>k!=='page')?<Button size="sm" variant="ghost" onClick={()=>router.push(path)}><X/>Réinitialiser</Button>:null}
    </div>
    <details className="ui-details" open={active>0?true:undefined}><summary><span className="inline-flex items-center gap-2"><SlidersHorizontal size={14}/>Affiner la liste{active?` · ${active} filtre(s) actif(s)`:''}</span></summary><div className="grid gap-3 sm:grid-cols-3"><Select value={sp.get('presence')??''} onChange={e=>update('presence',e.target.value)} aria-label="Présence web"><option value="">Toute présence web</option>{Object.entries(PRESENCE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</Select><Select value={sp.get('pipeline')??''} onChange={e=>update('pipeline',e.target.value)} aria-label="Statut"><option value="">Tous les statuts</option>{PIPELINE.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</Select><Select value={sp.get('minScore')??''} onChange={e=>update('minScore',e.target.value)} aria-label="Score minimum"><option value="">Tous les scores</option><option value="75">Score ≥ 75</option><option value="55">Score ≥ 55</option><option value="35">Score ≥ 35</option></Select><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={sp.get('requireEmail')==='true'} onChange={e=>update('requireEmail',e.target.checked?'true':'')}/>Avec une adresse email</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={sp.get('archived')==='true'} onChange={e=>update('archived',e.target.checked?'true':'')}/>Afficher les archivés</label></div></details>
  </div>
}
