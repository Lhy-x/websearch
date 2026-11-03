'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Inbox, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Card, EmptyState, Field, Input, Notice, Select, Skeleton, Textarea } from '@/components/ui/primitives'
import { PipelineBadge } from '@/components/badges'
import { CLASSIFICATION, MSG_STATUS } from '@/lib/labels'
import { RelativeTime } from '@/components/relative-time'
import { api, cn, fmtDate } from '@/lib/utils'

interface Conv { id: string; status: string; unread: boolean; last_classification: string | null; last_message_at: string; subject: string | null; business_id: string | null; business_name: string | null; campaign_name: string | null; last_body: string | null; last_summary: string | null }
interface Detail {
  conversation: Conv & { notes: string | null; pipeline_status: string | null }
  inbound: { id: string; from_email: string; subject: string; body_text: string; received_at: string; classification: string; classification_confidence: number; classification_source: string; summary: string | null; suggested_reply: string | null; attachments: { filename: string; size: number }[] }[]
  outbound: { id: string; to_email: string; subject: string; body_text: string; status: string; sent_at: string | null; scheduled_at: string | null; step: number }[]
}

export function InboxClient() {
  const sp = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const qc = useQueryClient()
  const [filter, setFilter] = useState('attention')
  const [manual, setManual] = useState(false)
  const current = sp.get('c')
  const list = useQuery({ queryKey: ['inbox', filter], queryFn: () => api<Conv[]>(`/api/inbox?filter=${filter}`), refetchInterval: 20000 })
  const detail = useQuery({ queryKey: ['conv', current], queryFn: () => api<Detail>(`/api/inbox/${current}`), enabled: !!current })
  useEffect(() => {
    if (detail.data) qc.invalidateQueries({ queryKey: ['inbox'] })
  }, [detail.data, qc])
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 text-xs" aria-label="Filtre">
            <option value="attention">Nécessitent mon attention</option>
            <option value="unread">Non lues</option>
            <option value="all">Toutes</option>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setManual(true)} aria-label="Saisir un email reçu"><Plus /></Button>
        </div>
        {list.isLoading ? <div className="space-y-2 p-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div> : list.data?.length ? (
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {list.data.map((c) => (
              <li key={c.id}>
                <button onClick={() => router.push(`${path}?c=${c.id}`)} className={cn('w-full px-3 py-2.5 text-left hover:bg-panel-2', current === c.id && 'bg-panel-2')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('truncate text-sm', c.unread && 'font-semibold')}>{c.business_name ?? 'Expéditeur inconnu'}</span>
                    <span className="shrink-0 text-[11px] text-muted"><RelativeTime date={c.last_message_at}/></span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {c.last_classification ? <Badge tone={CLASSIFICATION[c.last_classification]?.tone}>{CLASSIFICATION[c.last_classification]?.label}</Badge> : null}
                    <span className="truncate text-xs text-muted">{c.last_summary ?? c.last_body?.slice(0, 90)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<Inbox />} title="Aucune conversation" />}
      </Card>
      <div className="min-w-0">
        {!current ? <Card><EmptyState title="Sélectionnez une conversation" /></Card> : !detail.data ? <Card className="p-5"><Skeleton className="h-64" /></Card> : <Conversation d={detail.data} onChange={() => { detail.refetch(); qc.invalidateQueries({ queryKey: ['inbox'] }) }} />}
      </div>
      <ManualInbound open={manual} onOpenChange={setManual} onDone={(id) => { qc.invalidateQueries({ queryKey: ['inbox'] }); if (id) router.push(`${path}?c=${id}`) }} />
    </div>
  )
}

function Conversation({ d, onChange }: { d: Detail; onChange: () => void }) {
  const c = d.conversation
  const lastIn = [...d.inbound].sort((a, b) => b.received_at.localeCompare(a.received_at))[0]
  const [subject, setSubject] = useState(lastIn ? (lastIn.subject?.startsWith('Re:') ? lastIn.subject : `Re: ${lastIn.subject ?? ''}`) : '')
  const [body, setBody] = useState(lastIn?.suggested_reply ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setBody(lastIn?.suggested_reply ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id])
  const events = [
    ...d.inbound.map((i) => ({ at: i.received_at, k: 'in' as const, i })),
    ...d.outbound.map((o) => ({ at: o.sent_at ?? o.scheduled_at ?? '', k: 'out' as const, o })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const risky = /\b(prix|tarif|€|euros?|remise|réduction|devis|contrat|engag|délai|gratuit)\b/i.test(body)
  const act = async (json: Record<string, unknown>) => {
    try {
      await api(`/api/inbox/${c.id}`, { method: 'POST', json })
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <p className="text-sm font-semibold">{c.business_id ? <Link href={`/prospects/${c.business_id}`} className="hover:text-primary">{c.business_name}</Link> : 'Expéditeur inconnu'} {c.pipeline_status ? <PipelineBadge status={c.pipeline_status} /> : null}</p>
          <p className="text-xs text-muted">{c.campaign_name ? `Campagne : ${c.campaign_name}` : 'Hors campagne'}</p>
        </div>
        <Select value={c.status} onChange={(e) => act({ action: 'status', status: e.target.value })} className="h-8 w-48 text-xs" aria-label="Statut">
          <option value="NEEDS_ATTENTION">À traiter</option><option value="OPEN">Ouverte</option><option value="WAITING">En attente du prospect</option><option value="CLOSED">Clôturée</option>
        </Select>
      </div>
      <div className="max-h-[52vh] space-y-3 overflow-y-auto p-5">
        {events.map((e) =>
          e.k === 'in' ? (
            <div key={e.i.id} className="mr-10 rounded-lg border border-border bg-panel-2 p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-medium text-fg">{e.i.from_email}</span> · {fmtDate(e.i.received_at)}
                <Badge tone={CLASSIFICATION[e.i.classification]?.tone}>{CLASSIFICATION[e.i.classification]?.label}</Badge>
                <span>{e.i.classification_source} · {Math.round((e.i.classification_confidence ?? 0) * 100)} %</span>
                <select aria-label="Reclasser" className="rounded border border-border bg-panel px-1 text-[11px]" value={e.i.classification} onChange={(ev) => act({ action: 'reclassify', inboundId: e.i.id, classification: ev.target.value })}>
                  {Object.entries(CLASSIFICATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {e.i.summary ? <p className="mb-1 text-xs italic text-muted">Résumé : {e.i.summary}</p> : null}
              <p className="font-medium">{e.i.subject}</p>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{e.i.body_text}</pre>
              {e.i.attachments?.length ? <p className="mt-1 text-xs text-muted">Pièces jointes (non stockées) : {e.i.attachments.map((a) => a.filename).join(', ')}</p> : null}
            </div>
          ) : (
            <div key={e.o.id} className="ml-10 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">→ {e.o.to_email} · {fmtDate(e.at)} <Badge tone={MSG_STATUS[e.o.status]?.tone}>{MSG_STATUS[e.o.status]?.label}</Badge></div>
              <p className="font-medium">{e.o.subject}</p>
              <pre className="mt-1 line-clamp-6 whitespace-pre-wrap font-sans text-xs text-muted">{e.o.body_text}</pre>
            </div>
          ),
        )}
      </div>
      {lastIn ? (
        <form
          className="space-y-2 border-t border-border p-5"
          onSubmit={async (e) => {
            e.preventDefault()
            if (risky && !confirm('Ce message semble contenir un prix, un délai ou un engagement. Confirmez-vous l’envoi ?')) return
            setBusy(true)
            try {
              const r = await api<{ outcome: string; reason?: string }>(`/api/inbox/${c.id}`, { method: 'POST', json: { action: 'reply', subject, body } })
              if (r.outcome === 'SENT') toast.success('Réponse envoyée')
              else toast.warning(`Réponse non envoyée : ${r.reason ?? r.outcome}`)
              setBody('')
              onChange()
            } catch (err) {
              toast.error((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          {lastIn.suggested_reply ? <p className="text-xs text-muted">Brouillon proposé par l’IA — relisez avant d’envoyer. Aucune réponse n’est envoyée automatiquement.</p> : null}
          {risky ? <Notice tone="warning">Contient un élément commercial (prix, délai, engagement) : validation explicite requise.</Notice> : null}
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Objet" />
          <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Votre réponse…" aria-label="Réponse" />
          <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!body.trim()}><Send />Envoyer</Button></div>
        </form>
      ) : null}
    </Card>
  )
}

function ManualInbound({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: (conversationId: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Saisir un email reçu" description="Pour une réponse reçue hors IMAP/webhook. Elle est rattachée au prospect par l’adresse de l’expéditeur et classée comme les autres." wide>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          setBusy(true)
          try {
            const r = await api<{ inboundId: string | null; classification: string; businessId: string | null }>('/api/inbox/manual', { method: 'POST', json: { from: fd.get('from'), subject: fd.get('subject'), text: fd.get('text') } })
            toast.success(`Classé : ${CLASSIFICATION[r.classification]?.label ?? r.classification}${r.businessId ? '' : ' (prospect non identifié)'}`)
            onOpenChange(false)
            const list = await api<{ id: string }[]>('/api/inbox?filter=all')
            onDone(list[0]?.id ?? null)
          } catch (err) {
            toast.error((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="Expéditeur"><Input name="from" type="email" required /></Field>
        <Field label="Objet"><Input name="subject" /></Field>
        <Field label="Message"><Textarea name="text" rows={8} required /></Field>
        <Button type="submit" loading={busy}>Enregistrer</Button>
      </form>
    </Dialog>
  )
}
