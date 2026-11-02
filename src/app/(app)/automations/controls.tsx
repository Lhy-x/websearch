'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, Field, Input, Select, Td } from '@/components/ui/primitives'
import { api, fmtDate } from '@/lib/utils'

const post = (json: Record<string, unknown>) => api<Record<string, unknown>>('/api/automation', { method: 'POST', json })

export function FlagsPanel({ flags }: { flags: { globalPause: boolean; emergencyStop: boolean } }) {
  const router = useRouter()
  const toggle = async (json: Record<string, boolean>, msg: string) => {
    try {
      await post({ action: 'flags', ...json })
      toast.success(msg)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <Card>
      <CardHeader title="Contrôles" />
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-medium">Pause globale</p><p className="text-xs text-muted">Les workers ne prennent plus de nouvelles tâches ; les planifications sont suspendues.</p></div>
          <Button variant={flags.globalPause ? 'default' : 'outline'} size="sm" onClick={() => toggle({ globalPause: !flags.globalPause }, flags.globalPause ? 'Reprise' : 'Pause globale activée')}>{flags.globalPause ? 'Reprendre' : 'Mettre en pause'}</Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-medium">Arrêt d’urgence des envois</p><p className="text-xs text-muted">Bloque immédiatement tout envoi d’email de campagne.</p></div>
          <Button variant={flags.emergencyStop ? 'default' : 'danger'} size="sm" onClick={() => toggle({ emergencyStop: !flags.emergencyStop }, flags.emergencyStop ? 'Envois réautorisés' : 'Arrêt d’urgence activé')}>{flags.emergencyStop ? 'Lever l’arrêt' : 'Arrêt d’urgence'}</Button>
        </div>
      </CardBody>
    </Card>
  )
}

export function QuickActions() {
  const router = useRouter()
  const go = async (json: Record<string, unknown>, msg: string) => {
    try {
      const r = await post(json)
      toast.success(`${msg}${r.retried !== undefined ? ` (${r.retried})` : ''}`)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => go({ action: 'retry_failed' }, 'Tâches échouées relancées')}>Relancer les échecs (7 j)</Button>
      <Button variant="outline" size="sm" onClick={() => go({ action: 'enqueue', jobType: 'backup.run' }, 'Sauvegarde lancée')}>Sauvegarder maintenant</Button>
      <Button variant="outline" size="sm" onClick={() => go({ action: 'enqueue', jobType: 'maintenance.cleanup' }, 'Nettoyage lancé')}>Nettoyage</Button>
    </>
  )
}

export function ScheduleRow({ s }: { s: { id: string; name: string; label: string; cron: string; timezone: string; enabled: boolean; last_run_at: string | null; next_run_at: string | null } }) {
  const router = useRouter()
  return (
    <tr>
      <Td className="font-medium">{s.name}</Td>
      <Td className="text-xs">{s.label}</Td>
      <Td className="font-mono text-xs">{s.cron} <span className="text-muted">({s.timezone})</span></Td>
      <Td className="text-xs text-muted">{s.last_run_at ? fmtDate(s.last_run_at) : '—'}</Td>
      <Td className="text-xs text-muted">{s.enabled && s.next_run_at ? fmtDate(s.next_run_at) : <Badge>désactivée</Badge>}</Td>
      <Td className="text-right">
        <Button size="sm" variant="ghost" onClick={async () => { await post({ action: 'schedule_toggle', id: s.id, enabled: !s.enabled }); router.refresh() }}>{s.enabled ? 'Désactiver' : 'Activer'}</Button>
        <Button size="icon" variant="ghost" aria-label="Supprimer" onClick={async () => { if (confirm('Supprimer cette planification ?')) { await post({ action: 'schedule_delete', id: s.id }); router.refresh() } }}><Trash2 /></Button>
      </Td>
    </tr>
  )
}

export function ScheduleForm({ campaigns, saved }: { campaigns: { id: string; name: string }[]; saved: { id: string; name: string }[] }) {
  const router = useRouter()
  const [type, setType] = useState('search.run')
  return (
    <form
      className="grid gap-3 border-t border-border p-5 md:grid-cols-5"
      onSubmit={async (e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const target = String(fd.get('target') ?? '')
        const payload = type === 'search.run' ? { savedSearchId: target } : type === 'campaign.autofill' ? { campaignId: target } : {}
        try {
          await post({ action: 'schedule_create', name: fd.get('name'), jobType: type, cron: fd.get('cron'), payload })
          toast.success('Planification créée')
          router.refresh()
        } catch (err) {
          toast.error((err as Error).message)
        }
      }}
    >
      <Field label="Nom"><Input name="name" required /></Field>
      <Field label="Tâche">
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="search.run">Recherche enregistrée</option>
          <option value="campaign.autofill">Remplissage de campagne auto</option>
          <option value="inbox.sync">Synchronisation IMAP</option>
          <option value="backup.run">Sauvegarde</option>
          <option value="maintenance.cleanup">Nettoyage</option>
        </Select>
      </Field>
      <Field label="Cible">
        <Select name="target" disabled={!['search.run', 'campaign.autofill'].includes(type)}>
          {type === 'search.run' ? saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : type === 'campaign.autofill' ? campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : <option>—</option>}
        </Select>
      </Field>
      <Field label="Cron" hint="ex. 0 7 * * 1-5"><Input name="cron" required defaultValue="0 7 * * *" /></Field>
      <div className="flex items-end"><Button type="submit" className="w-full">Ajouter</Button></div>
    </form>
  )
}

export function JobFilters({ types }: { types: [string, string][] }) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const set = (k: string, v: string) => {
    const q = new URLSearchParams(sp)
    if (v) q.set(k, v)
    else q.delete(k)
    q.delete('page')
    router.push(`${path}?${q}`)
  }
  return (
    <div className="flex gap-2">
      <Select className="h-8 w-40 text-xs" value={sp.get('status') ?? ''} onChange={(e) => set('status', e.target.value)} aria-label="Statut"><option value="">Tous statuts</option>{['PENDING', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}</Select>
      <Select className="h-8 w-48 text-xs" value={sp.get('type') ?? ''} onChange={(e) => set('type', e.target.value)} aria-label="Type"><option value="">Tous types</option>{types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
    </div>
  )
}

export function JobButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  return (
    <div className="flex gap-2">
      {['PENDING', 'RETRYING', 'RUNNING'].includes(status) ? <Button variant="outline" onClick={async () => { await api(`/api/jobs/${id}?action=cancel`, { method: 'POST' }); router.refresh() }}>Annuler</Button> : null}
      {['FAILED', 'CANCELLED'].includes(status) ? <Button onClick={async () => { await api(`/api/jobs/${id}?action=retry`, { method: 'POST' }); toast.success('Tâche relancée'); router.refresh() }}>Relancer</Button> : null}
    </div>
  )
}
