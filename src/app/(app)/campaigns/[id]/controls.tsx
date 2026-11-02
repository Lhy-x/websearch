'use client'
import { Pause, Play, Square, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmButton, Dialog } from '@/components/ui/dialog'
import { Badge, Card, CardHeader, EmptyState, Field, Input, Textarea } from '@/components/ui/primitives'
import { MSG_STATUS } from '@/lib/labels'
import { api, fmtDate } from '@/lib/utils'

const call = (id: string, json: Record<string, unknown>) => api<Record<string, unknown>>(`/api/campaigns/${id}`, { method: 'POST', json })

export function CampaignControls({ id, status, mode }: { id: string; status: string; mode: string }) {
  const router = useRouter()
  const go = async (json: Record<string, unknown>, ok: string) => {
    try {
      const r = await call(id, json)
      toast.success(typeof r.reason === 'string' ? `${ok} — ${r.reason}` : ok)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'STOPPED' ? <Button variant="outline" onClick={() => go({ action: 'tick' }, 'Planificateur exécuté')}><RefreshCw />Traiter maintenant</Button> : null}
      {mode === 'AUTO' && status === 'ACTIVE' ? <Button variant="outline" onClick={() => go({ action: 'autofill' }, 'Remplissage automatique lancé')}>Ajouter des prospects (auto)</Button> : null}
      {status === 'ACTIVE' ? <Button variant="outline" onClick={() => go({ action: 'status', status: 'PAUSED' }, 'Campagne en pause')}><Pause />Pause</Button> : null}
      {status === 'DRAFT' || status === 'PAUSED' ? (
        <ConfirmButton variant="default" size="md" icon={<Play />} label={status === 'DRAFT' ? 'Activer' : 'Reprendre'} title="Activer la campagne ?" description={mode === 'MANUAL' ? 'Les messages seront préparés et attendront votre validation avant envoi.' : 'Les messages seront envoyés automatiquement via le fournisseur configuré, dans les limites définies.'} confirmLabel="Activer" onConfirm={() => go({ action: 'status', status: 'ACTIVE' }, 'Campagne activée')} />
      ) : null}
      {status !== 'STOPPED' ? <ConfirmButton icon={<Square />} label="Arrêter" size="md" title="Arrêter définitivement ?" description="Toutes les séquences sont stoppées et les messages programmés annulés. Irréversible." onConfirm={() => go({ action: 'status', status: 'STOPPED' }, 'Campagne arrêtée')} /> : null}
    </div>
  )
}

export function ProspectRowActions({ campaignId, id, status }: { campaignId: string; id: string; status: string }) {
  const router = useRouter()
  return (
    <div className="flex justify-end gap-1">
      {status === 'PENDING' ? <Button size="sm" variant="outline" onClick={async () => { await call(campaignId, { action: 'approve_prospects', ids: [id] }); router.refresh() }}>Valider</Button> : null}
      {['PENDING', 'APPROVED', 'ACTIVE'].includes(status) ? <Button size="sm" variant="ghost" onClick={async () => { await call(campaignId, { action: 'remove_prospect', id }); router.refresh() }}>Retirer</Button> : null}
    </div>
  )
}

interface Msg { id: string; business_name: string | null; to_email: string; step: number; subject: string; body_text: string; status: string; scheduled_at: string | null; sent_at: string | null; last_error: string | null; provider_message_id: string | null }

export function MessageQueue({ campaignId, messages }: { campaignId: string; messages: Msg[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState<Msg | null>(null)
  const awaiting = messages.filter((m) => m.status === 'AWAITING_APPROVAL').length
  return (
    <Card className="mt-6">
      <CardHeader title={`Messages (${messages.length})`} description="Chaque tentative est journalisée avec l’identifiant du fournisseur." actions={awaiting ? <Button size="sm" onClick={async () => { const r = await call(campaignId, { action: 'approve_all' }); toast.success(`${r.approved} message(s) validé(s)`); router.refresh() }}>Valider les {awaiting} message(s)</Button> : null} />
      {messages.length ? (
        <ul className="divide-y divide-border text-xs">
          {messages.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
              <Badge tone={MSG_STATUS[m.status]?.tone}>{MSG_STATUS[m.status]?.label ?? m.status}</Badge>
              <span className="font-medium">{m.business_name}</span>
              <span className="text-muted">{m.to_email} · étape {m.step + 1}</span>
              <button className="min-w-0 flex-1 truncate text-left hover:text-primary" onClick={() => setEdit(m)}>{m.subject}</button>
              <span className="text-muted">{m.sent_at ? `envoyé ${fmtDate(m.sent_at)}` : m.scheduled_at ? `prévu ${fmtDate(m.scheduled_at)}` : ''}</span>
              {m.provider_message_id ? <span className="font-mono text-[10px] text-muted">{m.provider_message_id}</span> : null}
              {m.last_error ? <span className="w-full text-danger">{m.last_error}</span> : null}
            </li>
          ))}
        </ul>
      ) : <EmptyState title="Aucun message" description="Les messages apparaissent quand la campagne est active et que des prospects sont dus." />}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.status === 'AWAITING_APPROVAL' ? 'Vérifier et valider' : 'Message'} description={edit ? `${edit.business_name} — ${edit.to_email}` : ''} wide>
        {edit ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              try {
                await call(campaignId, { action: 'approve_message', messageId: edit.id, subject: fd.get('subject'), body: fd.get('body') })
                toast.success('Message validé et programmé')
                setEdit(null)
                router.refresh()
              } catch (err) {
                toast.error((err as Error).message)
              }
            }}
          >
            <Field label="Objet"><Input name="subject" defaultValue={edit.subject} readOnly={edit.status !== 'AWAITING_APPROVAL'} /></Field>
            <Field label="Message" hint="Le lien de désinscription est obligatoire et sera rajouté s’il est supprimé."><Textarea name="body" rows={14} defaultValue={edit.body_text} readOnly={edit.status !== 'AWAITING_APPROVAL'} /></Field>
            {edit.status === 'AWAITING_APPROVAL' ? (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" className="text-danger" onClick={async () => { await call(campaignId, { action: 'cancel_message', messageId: edit.id }); setEdit(null); router.refresh() }}>Annuler ce message</Button>
                <Button type="submit">Valider l’envoi</Button>
              </div>
            ) : null}
          </form>
        ) : null}
      </Dialog>
    </Card>
  )
}
