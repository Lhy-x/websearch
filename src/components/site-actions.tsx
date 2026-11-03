'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check, Copy, Mail, RotateCcw, Send, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Field, Input, Notice, Textarea } from './ui/primitives'
import { api } from '@/lib/utils'
import { useJobRunner } from './use-job'

type Draft = { site: { business_email: string | null }; proposal: { initial: { subject: string; body: string } } | null }
export function SiteActions({ id, businessId, name, demoUrl, deleted = false, active = true }: { id: string; businessId: string; name: string; demoUrl: string; deleted?: boolean; active?: boolean }) {
  const router = useRouter()
  const runJob = useJobRunner()
  const [open, setOpen] = useState(false)
  const [trash, setTrash] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const validRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
  async function action(action: 'delete' | 'untrash') {
    setActionBusy(true)
    try { await api(`/api/sites/${id}`, { method: 'POST', json: { action } }); toast.success(action === 'delete' ? 'Démo placée dans la corbeille' : 'Démo restaurée'); setTrash(false); router.refresh() }
    catch (e) { toast.error((e as Error).message) } finally { setActionBusy(false) }
  }
  async function prepare() {
    setEmailLoading(true); setOpen(true)
    try { const r = await api<Draft>(`/api/sites/${id}`); setRecipient(r.site.business_email ?? ''); setSubject(r.proposal?.initial.subject ?? ''); setBody(r.proposal?.initial.body ?? '') }
    catch (e) { toast.error((e as Error).message) } finally { setEmailLoading(false) }
  }
  return <>
    <div className="flex flex-wrap items-center gap-2 py-2">
      {deleted ? <Button size="sm" variant="outline" loading={actionBusy} onClick={() => action('untrash')}><RotateCcw/>Restaurer</Button> : <><Button size="sm" disabled={!active} onClick={prepare}><Mail/>Préparer l’email</Button><Button size="sm" variant="ghost" disabled={!active} title="Copier le lien de démo" aria-label="Copier la démo" onClick={() => navigator.clipboard.writeText(demoUrl).then(() => toast.success('Lien de démo copié')).catch(() => toast.error('Copie impossible. Ouvrez la démo pour copier son adresse.'))}><Copy/></Button><Button size="sm" variant="ghost" className="ml-auto text-muted hover:text-danger" aria-label="Supprimer" title="Placer dans la corbeille" onClick={() => setTrash(true)}><Trash2/></Button></>}
    </div>
    <Dialog open={trash} onOpenChange={setTrash} title="Placer cette démo dans la corbeille ?" description={`La démo de ${name} ne sera plus accessible depuis son lien public. Vous pourrez la restaurer depuis la corbeille.`} footer={<><Button variant="outline" onClick={() => setTrash(false)}>Garder la démo</Button><Button variant="danger" loading={actionBusy} onClick={() => action('delete')}><Trash2/>Placer dans la corbeille</Button></>}><Notice>Les commandes déjà réglées et les factures restent conservées. Vos clients gardent accès à leur achat.</Notice></Dialog>
    <Dialog open={open} onOpenChange={setOpen} title={`Email pour ${name}`} description="Rédigez, ajustez, puis ouvrez votre messagerie. Vous gardez la main sur l’envoi." wide>
      <div className="space-y-5">
        <div className="email-step"><span>{body ? <Check size={13}/> : '1'}</span><div className="flex-1"><strong className="block font-medium text-fg">Un message personnalisé</strong><p className="mt-1 text-[11px]">Le lien de démo et, si activé, le paiement sont inclus.</p></div><Button size="sm" variant={body ? 'outline' : 'default'} loading={busy || emailLoading} onClick={async () => { setBusy(true); try { await runJob('Rédaction de l’email', () => api(`/api/prospects/${businessId}`, { method: 'POST', json: { action: 'proposal', websiteId: id } })); const r = await api<Draft>(`/api/sites/${id}`); if (r.proposal) { setSubject(r.proposal.initial.subject); setBody(r.proposal.initial.body) } } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) } }}><Sparkles/>{busy ? 'Rédaction…' : body ? 'Nouvelle version' : 'Rédiger mon email'}</Button></div>
        <div className="flex items-center gap-2 text-xs font-medium"><span className="grid size-6 place-items-center rounded-full bg-panel-2 text-primary">2</span>Relisez et ajustez votre proposition</div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Destinataire"><Input type="email" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="contact@entreprise.fr" autoComplete="email"/></Field><Field label="Objet"><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Votre proposition personnalisée" disabled={emailLoading}/></Field></div>
        <Field label="Message"><Textarea value={body} rows={9} onChange={e => setBody(e.target.value)} disabled={emailLoading} placeholder="Cliquez sur « Rédiger mon email » pour préparer votre proposition."/></Field>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5"><Button disabled={!body || !validRecipient || busy} onClick={() => { window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` }}><Send/>Ouvrir ma messagerie</Button><Button variant="outline" disabled={!body || busy} onClick={() => navigator.clipboard.writeText(`Objet : ${subject}\n\n${body}`).then(() => toast.success('Email copié')).catch(() => toast.error('Copie impossible'))}><Copy/>Copier l’email</Button></div>
        <p className="text-[11px] leading-6 text-muted">Aucun email n’est envoyé automatiquement.{!validRecipient ? <> Ajoutez l’adresse du destinataire ici ou dans <Link className="text-primary underline" href={`/prospects/${businessId}`}>sa fiche prospect</Link>.</> : ' Votre messagerie s’ouvrira avec le brouillon.'}</p>
      </div>
    </Dialog>
  </>
}
