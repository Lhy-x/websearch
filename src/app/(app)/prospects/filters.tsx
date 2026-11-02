'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input, Select } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { SECTORS } from '@/lib/sectors'
import { PIPELINE, PRESENCE } from '@/lib/labels'

export function ProspectFilters() {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const update = (k: string, v: string) => {
    const q = new URLSearchParams(sp)
    if (v) q.set(k, v)
    else q.delete(k)
    q.delete('page')
    router.push(`${path}?${q}`)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form className="w-64" onSubmit={(e) => { e.preventDefault(); update('q', String(new FormData(e.currentTarget).get('q') ?? '')) }}>
        <Input name="q" defaultValue={sp.get('q') ?? ''} placeholder="Nom, ville, email, SIRET…" aria-label="Recherche" />
      </form>
      <Select className="w-44" value={sp.get('sector') ?? ''} onChange={(e) => update('sector', e.target.value)} aria-label="Secteur">
        <option value="">Tous secteurs</option>
        {SECTORS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </Select>
      <Select className="w-48" value={sp.get('presence') ?? ''} onChange={(e) => update('presence', e.target.value)} aria-label="Présence web">
        <option value="">Toute présence web</option>
        {Object.entries(PRESENCE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </Select>
      <Select className="w-44" value={sp.get('pipeline') ?? ''} onChange={(e) => update('pipeline', e.target.value)} aria-label="Statut">
        <option value="">Tous statuts</option>
        {PIPELINE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </Select>
      <Select className="w-36" value={sp.get('minScore') ?? ''} onChange={(e) => update('minScore', e.target.value)} aria-label="Score minimum">
        <option value="">Tout score</option>
        <option value="75">Score ≥ 75</option>
        <option value="55">Score ≥ 55</option>
        <option value="35">Score ≥ 35</option>
      </Select>
      <Select className="w-40" value={sp.get('sort') ?? 'score'} onChange={(e) => update('sort', e.target.value)} aria-label="Tri">
        <option value="score">Tri : score</option>
        <option value="created">Tri : date</option>
        <option value="name">Tri : nom</option>
        <option value="city">Tri : ville</option>
        <option value="confidence">Tri : confiance</option>
      </Select>
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={sp.get('requireEmail') === 'true'} onChange={(e) => update('requireEmail', e.target.checked ? 'true' : '')} />Avec email</label>
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={sp.get('archived') === 'true'} onChange={(e) => update('archived', e.target.checked ? 'true' : '')} />Archivés</label>
      {[...sp.keys()].length ? <Button size="sm" variant="ghost" onClick={() => router.push(path)}>Réinitialiser</Button> : null}
    </div>
  )
}
