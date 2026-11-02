'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, Field, Input, Notice, Select, Textarea } from '@/components/ui/primitives'
import { useSelection } from '@/components/selection'
import { api } from '@/lib/utils'

const VARIANTS = [['initial', 'Email initial'], ['short', 'Variante courte'], ['direct', 'Variante directe'], ['personalized', 'Variante personnalisée'], ['followup1', 'Relance 1'], ['followup2', 'Relance 2'], ['meeting', 'Proposition de RDV']] as const
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export function NewCampaignForm({ offers, strategies, saved, defaults }: { offers: { id: string; name: string }[]; strategies: { id: string; name: string }[]; saved: { id: string; name: string }[]; defaults: { fromName: string; fromEmail: string; replyTo: string; dailyLimit: number; delays: number[] } }) {
  const router = useRouter()
  const sel = useSelection()
  const [mode, setMode] = useState<'MANUAL' | 'SEMI_AUTO' | 'AUTO'>('MANUAL')
  const [days, setDays] = useState([1, 2, 3, 4, 5])
  const [steps, setSteps] = useState([{ delayDays: 0, contentKey: 'initial' }, ...defaults.delays.map((d, i) => ({ delayDays: i === 0 ? d : d - (defaults.delays[i - 1] ?? 0), contentKey: i === 0 ? 'followup1' : 'followup2' }))])
  const [busy, setBusy] = useState(false)
  const [addSelection, setAddSelection] = useState(true)
  const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0) }
  return (
    <form
      className="grid gap-6 xl:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        setBusy(true)
        try {
          const { id } = await api<{ id: string }>('/api/campaigns', {
            method: 'POST',
            json: {
              name: fd.get('name'), description: fd.get('description'), mode,
              fromName: fd.get('fromName') || null, fromEmail: fd.get('fromEmail') || null, replyTo: fd.get('replyTo') || null,
              offerId: fd.get('offerId') || null, strategyId: fd.get('strategyId') || null, timezone: fd.get('timezone'),
              sendDays: days, sendStartMinute: hm(String(fd.get('start'))), sendEndMinute: hm(String(fd.get('end'))),
              dailyLimit: Number(fd.get('dailyLimit')), minIntervalSeconds: Number(fd.get('interval')),
              steps,
              autoFilters: mode === 'AUTO' ? { savedSearchId: fd.get('savedSearchId') || null, minScore: Number(fd.get('minScore')), requireEmail: true, maxPerRun: Number(fd.get('maxPerRun')) } : null,
              autoGenerateSite: fd.get('autoGenerateSite') === 'on',
            },
          })
          if (addSelection && sel.ids.size) {
            const r = await api<{ added: number; skipped: unknown[] }>(`/api/campaigns/${id}`, { method: 'POST', json: { action: 'add_prospects', businessIds: [...sel.ids] } })
            toast.success(`Campagne créée — ${r.added} prospect(s) ajouté(s), ${r.skipped.length} ignoré(s)`)
          } else toast.success('Campagne créée')
          router.push(`/campaigns/${id}`)
        } catch (err) {
          toast.error((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Card>
        <CardHeader title="Général" />
        <CardBody className="space-y-3">
          <Field label="Nom"><Input name="name" required maxLength={120} placeholder="Coiffeurs Rouen — novembre" /></Field>
          <Field label="Description"><Textarea name="description" rows={2} /></Field>
          <Field label="Mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="MANUAL">Manuel — chaque message est validé avant envoi</option>
              <option value="SEMI_AUTO">Semi-automatique — vous validez les prospects, le système gère la séquence</option>
              <option value="AUTO">Automatique — recherche, éligibilité, rédaction, envois et relances</option>
            </Select>
          </Field>
          {mode === 'AUTO' ? (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
              <Field label="Recherche source" className="col-span-2"><Select name="savedSearchId"><option value="">Toute la base</option>{saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Score minimum"><Input name="minScore" type="number" min={0} max={100} defaultValue={60} /></Field>
              <Field label="Prospects ajoutés par exécution"><Input name="maxPerRun" type="number" min={1} max={200} defaultValue={20} /></Field>
              <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" name="autoGenerateSite" defaultChecked />Générer automatiquement une démonstration</label>
            </div>
          ) : null}
          <Field label="Offre"><Select name="offerId">{offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          <Field label="Stratégie de rédaction"><Select name="strategyId">{strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          {sel.ids.size ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={addSelection} onChange={(e) => setAddSelection(e.target.checked)} />Ajouter les {sel.ids.size} prospect(s) sélectionné(s)</label> : null}
        </CardBody>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Expéditeur & cadence" />
          <CardBody className="grid grid-cols-2 gap-3">
            <Field label="Nom expéditeur"><Input name="fromName" defaultValue={defaults.fromName} /></Field>
            <Field label="Email expéditeur"><Input name="fromEmail" type="email" defaultValue={defaults.fromEmail} required /></Field>
            <Field label="Répondre à" className="col-span-2"><Input name="replyTo" type="email" defaultValue={defaults.replyTo} /></Field>
            <Field label="Fuseau horaire"><Select name="timezone" defaultValue="Europe/Paris"><option>Europe/Paris</option><option>Europe/Brussels</option><option>Europe/Zurich</option></Select></Field>
            <Field label="Limite quotidienne"><Input name="dailyLimit" type="number" min={1} max={2000} defaultValue={defaults.dailyLimit} /></Field>
            <Field label="Début"><Input name="start" type="time" defaultValue="09:00" /></Field>
            <Field label="Fin"><Input name="end" type="time" defaultValue="18:00" /></Field>
            <Field label="Intervalle minimal entre 2 envois (s)" className="col-span-2"><Input name="interval" type="number" min={10} max={3600} defaultValue={120} /></Field>
            <div className="col-span-2 flex flex-wrap gap-1">
              {DAYS.map((d, i) => <button type="button" key={d} onClick={() => setDays((s) => (s.includes(i + 1) ? s.filter((x) => x !== i + 1) : [...s, i + 1].sort()))} className={`rounded-md border px-2.5 py-1 text-xs ${days.includes(i + 1) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted'}`}>{d}</button>)}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Séquence" description="Les relances s’arrêtent dès qu’un prospect répond, se désinscrit, rebondit, devient client ou est marqué non pertinent." />
          <CardBody className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-end gap-2">
                <Field label={i === 0 ? 'Étape 1 — J0' : `Étape ${i + 1} — délai (jours après l’étape précédente)`} className="flex-1">
                  <div className="flex gap-2">
                    {i > 0 ? <Input type="number" min={1} max={60} className="w-20" value={s.delayDays} onChange={(e) => setSteps((st) => st.map((x, k) => (k === i ? { ...x, delayDays: Number(e.target.value) } : x)))} /> : null}
                    <Select value={s.contentKey} onChange={(e) => setSteps((st) => st.map((x, k) => (k === i ? { ...x, contentKey: e.target.value } : x)))}>{VARIANTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                  </div>
                </Field>
                {i > 0 ? <Button type="button" size="icon" variant="ghost" aria-label="Retirer l’étape" onClick={() => setSteps((st) => st.filter((_, k) => k !== i))}><Trash2 /></Button> : null}
              </div>
            ))}
            {steps.length < 6 ? <Button type="button" size="sm" variant="outline" onClick={() => setSteps((s) => [...s, { delayDays: 4, contentKey: 'followup2' }])}><Plus />Ajouter une relance</Button> : null}
            <Notice tone="info">Les contenus sont rédigés par prospect (IA si configurée, sinon modèles déterministes) à partir des faits vérifiés, avec le lien de démonstration et un lien de désinscription.</Notice>
          </CardBody>
        </Card>
        <Button type="submit" className="w-full" loading={busy}>Créer la campagne (brouillon)</Button>
      </div>
    </form>
  )
}
