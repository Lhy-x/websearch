'use client'
import * as DM from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Pencil, Sparkles, Check, X, Star } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmButton, Dialog } from '@/components/ui/dialog'
import { Badge, Card, CardBody, CardHeader, Field, Input, Notice, Select, Textarea } from '@/components/ui/primitives'
import { useJobRunner } from '@/components/use-job'
import { PIPELINE } from '@/lib/labels'
import { SECTORS } from '@/lib/sectors'
import { TEMPLATES } from '@/lib/site/templates'
import { STYLES } from '@/lib/site/schema'
import { api, fmtDate, fmtEur } from '@/lib/utils'
import Link from 'next/link'

const post = (id: string, json: Record<string, unknown>) => api<{ jobId?: string; keptId?: string }>(`/api/prospects/${id}`, { method: 'POST', json })

export function ProspectActions({ id, status, sites }: { id: string; status: string; sites: string[] }) {
  const router = useRouter()
  const runJob = useJobRunner()
  const [gen, setGen] = useState(false)
  const [noSite, setNoSite] = useState(false)
  const simple = async (json: Record<string, unknown>, ok: string) => {
    try {
      await post(id, json)
      toast.success(ok)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="w-44" value={status} onChange={(e) => simple({ action: 'set_status', status: e.target.value }, 'Statut mis à jour')} aria-label="Statut du pipeline">
        {PIPELINE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </Select>
      <Button onClick={() => setGen(true)}><Sparkles />Générer un site</Button>
      <Button variant="outline" onClick={() => runJob('Proposition commerciale', () => post(id, { action: 'proposal', websiteId: sites[0] ?? null }))}>Créer une proposition</Button>
      <DM.Root>
        <DM.Trigger asChild><Button variant="outline">Actions<ChevronDown /></Button></DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={6} className="z-50 min-w-[220px] rounded-lg border border-border bg-panel p-1 text-sm shadow-xl">
            {[
              ['Enrichir maintenant', () => runJob('Enrichissement', () => post(id, { action: 'enrich' }))],
              ['Auditer le site', () => runJob('Audit', () => post(id, { action: 'audit' }))],
              ['Confirmer l’absence de site…', () => setNoSite(true)],
              ['Ne pas contacter (opposition)', () => confirm('Ajouter ce prospect à la liste d’opposition ? Les séquences seront arrêtées.') && simple({ action: 'do_not_contact' }, 'Opposition enregistrée')],
            ].map(([label, fn]) => (
              <DM.Item key={label as string} onSelect={fn as () => void} className="cursor-pointer rounded-md px-2.5 py-1.5 outline-none data-[highlighted]:bg-panel-2">{label as string}</DM.Item>
            ))}
            <DM.Separator className="my-1 h-px bg-border" />
            <DM.Item onSelect={async () => { if (confirm('Supprimer définitivement ce prospect et toutes ses données (RGPD) ?')) { await post(id, { action: 'delete' }); router.push('/prospects') } }} className="cursor-pointer rounded-md px-2.5 py-1.5 text-danger outline-none data-[highlighted]:bg-danger/10">Supprimer les données…</DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
      <GenerateDialog open={gen} onOpenChange={setGen} onSubmit={(o) => runJob('Génération du site', () => post(id, { action: 'generate_site', ...o }))} />
      <Dialog open={noSite} onOpenChange={setNoSite} title="Confirmer l’absence de site" description="À utiliser après une vérification manuelle (recherche web, appel…). La fiche passera en « absence confirmée ».">
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await simple({ action: 'confirm_no_website', note: String(new FormData(e.currentTarget).get('note') ?? '') }, 'Absence de site confirmée'); setNoSite(false) }}>
          <Field label="Note de vérification"><Input name="note" maxLength={300} placeholder="Recherche Google + Pages Jaunes le 02/11" /></Field>
          <Button type="submit">Confirmer</Button>
        </form>
      </Dialog>
    </div>
  )
}

export function GenerateDialog({ open, onOpenChange, onSubmit, count }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (o: { templateId: string | null; style: string | null; generator: string }) => void; count?: number }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={count ? `Générer ${count} site(s)` : 'Générer un site de démonstration'} description="Le contenu n’utilise que les faits vérifiés ; les prestations sont marquées « indicatives ».">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          onSubmit({ templateId: (fd.get('templateId') as string) || null, style: (fd.get('style') as string) || null, generator: String(fd.get('generator')) })
          onOpenChange(false)
        }}
      >
        <Field label="Template"><Select name="templateId" defaultValue=""><option value="">Automatique (selon le secteur)</option>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Style" hint="Pour le sur mesure, sert d’orientation (l’IA garde la main sur le parti pris)."><Select name="style" defaultValue=""><option value="">Choix du template / de l’IA</option>{STYLES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</Select></Field>
        <Field label="Moteur" hint="« Sur mesure » : l’IA conçoit un site unique (guide frontend-design) puis il est contrôlé et corrigé automatiquement. « Template » : structure prédéfinie, textes IA ou déterministes.">
          <Select name="generator" defaultValue="auto"><option value="auto">Automatique (sur mesure si l’IA est disponible)</option><option value="bespoke">Sur mesure (IA — qualité maximale)</option><option value="ai">Template + textes IA</option><option value="deterministic">Template déterministe (sans IA)</option></Select>
        </Field>
        <Button type="submit"><Sparkles />Générer</Button>
      </form>
    </Dialog>
  )
}

export function EditProspect({ business }: { business: { id: string; name: string; sector: string | null; address: string | null; postcode: string | null; city: string | null; phone: string | null; tags: string[] } }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}>+ Contact</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil />Modifier</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Modifier la fiche" description="Les modifications manuelles priment sur les données des sources.">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            setBusy(true)
            try {
              await api(`/api/prospects/${business.id}`, { method: 'PATCH', json: { name: fd.get('name'), sector: fd.get('sector') || null, address: fd.get('address') || null, postcode: fd.get('postcode') || null, city: fd.get('city') || null, phone: fd.get('phone') || null, tags: String(fd.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean) } })
              toast.success('Fiche mise à jour')
              setOpen(false)
              router.refresh()
            } catch (err) {
              toast.error((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <Field label="Nom" className="col-span-2"><Input name="name" defaultValue={business.name} required /></Field>
          <Field label="Secteur"><Select name="sector" defaultValue={business.sector ?? ''}><option value="">—</option>{SECTORS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
          <Field label="Téléphone"><Input name="phone" defaultValue={business.phone ?? ''} /></Field>
          <Field label="Adresse" className="col-span-2"><Input name="address" defaultValue={business.address ?? ''} /></Field>
          <Field label="Code postal"><Input name="postcode" defaultValue={business.postcode ?? ''} /></Field>
          <Field label="Ville"><Input name="city" defaultValue={business.city ?? ''} /></Field>
          <Field label="Tags (séparés par des virgules)" className="col-span-2"><Input name="tags" defaultValue={business.tags.join(', ')} /></Field>
          <div className="col-span-2"><Button type="submit" loading={busy}>Enregistrer</Button></div>
        </form>
      </Dialog>
      <Dialog open={addOpen} onOpenChange={setAddOpen} title="Ajouter un contact" description="Ajout manuel : enregistré avec la source « manual ».">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            try {
              await post(business.id, { action: 'add_contact', kind: fd.get('kind'), value: fd.get('value') })
              toast.success('Contact ajouté')
              setAddOpen(false)
              router.refresh()
            } catch (err) {
              toast.error((err as Error).message)
            }
          }}
        >
          <Field label="Type"><Select name="kind"><option value="email">Email</option><option value="phone">Téléphone</option><option value="website">Site web</option><option value="social">Réseau social</option></Select></Field>
          <Field label="Valeur"><Input name="value" required /></Field>
          <Button type="submit">Ajouter</Button>
        </form>
      </Dialog>
    </div>
  )
}

export function ContactActions({ businessId, contactId, status }: { businessId: string; contactId: string; status: string }) {
  const router = useRouter()
  const go = async (json: Record<string, unknown>) => {
    try {
      await post(businessId, { action: 'contact_status', contactId, ...json })
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="flex justify-end gap-0.5">
      <button title="Définir comme principal" aria-label="Définir comme principal" className="rounded p-1 text-muted hover:bg-panel-2" onClick={() => go({ primary: true })}><Star className="size-3.5" /></button>
      {status !== 'SOURCE_CONFIRMED' ? <button title="Marquer vérifié" aria-label="Marquer vérifié" className="rounded p-1 text-muted hover:bg-panel-2" onClick={() => go({ status: 'SOURCE_CONFIRMED' })}><Check className="size-3.5" /></button> : null}
      {status !== 'INVALID' ? <button title="Marquer invalide" aria-label="Marquer invalide" className="rounded p-1 text-muted hover:bg-panel-2" onClick={() => go({ status: 'INVALID' })}><X className="size-3.5" /></button> : null}
    </div>
  )
}

export function NotesTasks({ businessId, notes, tasks }: { businessId: string; notes: { id: string; body: string; created_at: string }[]; tasks: { id: string; title: string; due_at: string | null; done_at: string | null; source: string }[] }) {
  const router = useRouter()
  const add = async (json: Record<string, unknown>) => {
    try {
      await post(businessId, json)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <Card>
      <CardHeader title="Tâches & notes" />
      <CardBody className="space-y-4">
        <ul className="space-y-1.5 text-xs">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <input type="checkbox" checked={!!t.done_at} onChange={(e) => add({ action: 'task_done', taskId: t.id, done: e.target.checked })} aria-label={t.title} className="mt-0.5" />
              <span className={t.done_at ? 'text-muted line-through' : ''}>{t.title}{t.due_at ? <span className="text-muted"> · {fmtDate(t.due_at)}</span> : null}{t.source !== 'manual' ? <Badge className="ml-1">{t.source}</Badge> : null}</span>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const due = String(fd.get('due') ?? ''); await add({ action: 'task', title: fd.get('title'), dueAt: due ? new Date(due).toISOString() : null }); e.currentTarget.reset() }}>
          <Input name="title" placeholder="Nouvelle tâche" required />
          <Input name="due" type="datetime-local" className="w-44" aria-label="Échéance" />
          <Button size="sm" type="submit">+</Button>
        </form>
        <div className="border-t border-border pt-3">
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; await add({ action: 'note', body: new FormData(f).get('body') }); f.reset() }}>
            <Textarea name="body" rows={2} placeholder="Ajouter une note…" required />
            <Button size="sm" variant="outline" type="submit">Ajouter la note</Button>
          </form>
          <ul className="mt-3 space-y-2 text-xs">{notes.map((n) => <li key={n.id} className="whitespace-pre-wrap rounded-lg bg-panel-2 p-2.5">{n.body}<p className="mt-1 text-[10px] text-muted">{fmtDate(n.created_at)}</p></li>)}</ul>
        </div>
      </CardBody>
    </Card>
  )
}

export function Opportunities({ businessId, opps }: { businessId: string; opps: { id: string; title: string; amount_cents: number | null; status: string; signed_at: string | null; paid_cents: number | null }[] }) {
  const router = useRouter()
  const go = async (json: Record<string, unknown>) => {
    try {
      await post(businessId, json)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <Card>
      <CardHeader title="Opportunités" description="Chiffre d’affaires enregistré manuellement" />
      <CardBody className="space-y-3 text-xs">
        {opps.map((o) => (
          <div key={o.id} className="rounded-lg border border-border p-3">
            <p className="font-medium">{o.title} · {fmtEur(o.amount_cents)} <Badge tone={o.status === 'WON' ? 'success' : o.status === 'LOST' ? 'danger' : 'neutral'}>{o.status}</Badge></p>
            {o.status === 'WON' ? <p className="mt-1 text-muted">Signé le {fmtDate(o.signed_at, false)} · encaissé {fmtEur(o.paid_cents)}</p> : null}
            <div className="mt-2 flex flex-wrap gap-1">
              {o.status === 'OPEN' ? <><Button size="sm" variant="outline" onClick={() => go({ action: 'opportunity_update', opportunityId: o.id, status: 'WON' })}>Gagnée</Button><Button size="sm" variant="ghost" onClick={() => go({ action: 'opportunity_update', opportunityId: o.id, status: 'LOST' })}>Perdue</Button></> : null}
              {o.status === 'WON' ? <Button size="sm" variant="outline" onClick={() => { const v = prompt('Montant encaissé (€)', o.amount_cents ? String(o.amount_cents / 100) : ''); if (v !== null) go({ action: 'opportunity_update', opportunityId: o.id, paidCents: Math.round(Number(v.replace(',', '.')) * 100) }) }}>Saisir l’encaissement</Button> : null}
            </div>
          </div>
        ))}
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; const fd = new FormData(f); const amt = String(fd.get('amount') ?? ''); await go({ action: 'opportunity', title: fd.get('title'), amountCents: amt ? Math.round(Number(amt.replace(',', '.')) * 100) : null }); f.reset() }}>
          <Input name="title" placeholder="Site vitrine" required />
          <Input name="amount" placeholder="€" className="w-24" inputMode="decimal" />
          <Button size="sm" type="submit">+</Button>
        </form>
      </CardBody>
    </Card>
  )
}

export function MergeReview({ id, merges }: { id: string; merges: { id: string; score: number; reasons: string[]; other_id: string; other_name: string }[] }) {
  const router = useRouter()
  return (
    <div className="mb-6 space-y-2">
      {merges.map((m) => (
        <Notice key={m.id} tone="warning" title={`Doublon potentiel : « ${m.other_name} » (score ${(m.score * 100).toFixed(0)} %)`}>
          <p>{m.reasons.join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild><Link href={`/prospects/${m.other_id}`}>Voir l’autre fiche</Link></Button>
            <ConfirmButton label="Fusionner (garder cette fiche)" variant="outline" title="Fusionner les fiches" description="Sources, contacts et historique de l’autre fiche seront rattachés à celle-ci. L’autre fiche sera archivée." onConfirm={async () => { await post(id, { action: 'merge', otherId: m.other_id, keep: 'this' }); router.refresh() }} />
            <Button size="sm" variant="ghost" onClick={async () => { await post(id, { action: 'reject_merge', mergeId: m.id }); router.refresh() }}>Ce ne sont pas les mêmes</Button>
          </div>
        </Notice>
      ))}
    </div>
  )
}
