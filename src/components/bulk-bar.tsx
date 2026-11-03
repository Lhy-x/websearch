'use client'
import { useQuery } from '@tanstack/react-query'
import { Globe, Megaphone, Sparkles, Tag, X, Ban, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSelection } from './selection'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field, Input, Select } from './ui/primitives'
import { api } from '@/lib/utils'

export async function bulk(ids: string[], action: string, extra: Record<string, unknown> = {}) {
  return api<Record<string, unknown>>('/api/prospects/bulk', { method: 'POST', json: { ids, action, ...extra } })
}

/** Floating action bar for the persistent prospect selection (visible on every page). */
export function BulkBar() {
  const sel = useSelection()
  const router = useRouter()
  const [dialog, setDialog] = useState<null | 'campaign' | 'tag'>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const ids = [...sel.ids]
  const campaigns = useQuery({ queryKey: ['campaigns-min'], queryFn: () => api<{ id: string; name: string; status: string }[]>('/api/campaigns?min=1'), enabled: dialog === 'campaign' })
  if (!ids.length) return null
  const run = async (action: string, label: string, extra: Record<string, unknown> = {}) => {
    setBusy(action)
    try {
      const r = await bulk(ids, action, extra)
      toast.success(`${label} : ${r.queued !== undefined ? `${r.queued} tâche(s) lancée(s)` : r.added !== undefined ? `${r.added} ajouté(s), ${(r.skipped as unknown[]).length} ignoré(s)` : 'fait'}`)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-panel px-3 py-2 shadow-xl">
        <span className="px-1 text-xs font-medium tabular">{ids.length} sélectionné(s)</span>
        <Button size="sm" variant="ghost" loading={busy === 'enrich'} onClick={() => run('enrich', 'Enrichissement')}><RefreshCw />Enrichir</Button>
        <Button size="sm" variant="ghost" loading={busy === 'generate_site'} onClick={() => run('generate_site', 'Création sur mesure', {generator:'personalized'})}><Sparkles />Créer les sites sur mesure</Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog('campaign')}><Megaphone />Ajouter à une campagne</Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog('tag')}><Tag />Tag</Button>
        <Button size="sm" variant="ghost" onClick={() => router.push(`/prospects?ids=${ids.slice(0, 300).join(',')}`)}><Globe />Voir</Button>
        <Button size="sm" variant="ghost" className="text-danger" loading={busy === 'do_not_contact'} onClick={() => confirm(`Marquer ${ids.length} prospect(s) « ne pas contacter » ?`) && run('do_not_contact', 'Opposition')}><Ban />Ne pas contacter</Button>
        <Button size="icon" variant="ghost" aria-label="Vider la sélection" onClick={sel.clear}><X /></Button>
      </div>
      <Dialog open={dialog === 'campaign'} onOpenChange={(o) => !o && setDialog(null)} title="Ajouter à une campagne" description="Seuls les prospects avec un email exploitable, non opposés et hors liste de suppression sont ajoutés.">
        {campaigns.data?.length ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const id = new FormData(e.currentTarget).get('campaignId') as string
              await run('add_to_campaign', 'Campagne', { campaignId: id })
              setDialog(null)
            }}
          >
            <Field label="Campagne">
              <Select name="campaignId">{campaigns.data.filter((c) => c.status !== 'STOPPED').map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}</Select>
            </Field>
            <Button type="submit" loading={busy === 'add_to_campaign'}>Ajouter</Button>
          </form>
        ) : (
          <p className="text-sm text-muted">{campaigns.isLoading ? 'Chargement…' : 'Aucune campagne. Créez-en une dans le module Campagnes.'}</p>
        )}
      </Dialog>
      <Dialog open={dialog === 'tag'} onOpenChange={(o) => !o && setDialog(null)} title="Ajouter un tag">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const tag = String(new FormData(e.currentTarget).get('tag'))
            await run('tag', 'Tag', { tag })
            setDialog(null)
          }}
        >
          <Input name="tag" required maxLength={40} placeholder="ex. rouen-prioritaire" />
          <Button type="submit">Ajouter</Button>
        </form>
      </Dialog>
    </>
  )
}
