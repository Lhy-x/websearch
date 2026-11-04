'use client'

import { useEffect, useState } from 'react'
import { Copy, ExternalLink, Power, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { RESEND_WEBHOOK_EVENTS, type ResendWebhookStatus } from '@/lib/resend-webhook'
import { api } from '@/lib/utils'
import { Button } from './ui/button'
import { Badge, Card, CardBody, CardHeader, Field, Input, Notice } from './ui/primitives'

export function ResendWebhookSettings({ onSaved }: { onSaved?: () => Promise<void> }) {
  const [data, setData] = useState<ResendWebhookStatus | null>(null)
  const [base, setBase] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function load() {
    try {
      const next = await api<ResendWebhookStatus>('/api/connections/resend-webhook')
      setData(next); setBase(next.webhook ? new URL(next.webhook.endpoint).origin : next.defaultBase); setError('')
    } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => { void load() }, [])
  async function configure() {
    setBusy(true); setError('')
    try {
      const next = await api<ResendWebhookStatus>('/api/connections/resend-webhook', { method: 'POST', json: { base, ...(key.trim() ? { key: key.trim() } : {}) } })
      setData(next); setKey(''); await onSaved?.(); toast.success('Webhook Resend configuré : secret enregistré automatiquement')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function toggle() {
    setBusy(true); setError('')
    try {
      const next = await api<ResendWebhookStatus>('/api/connections/resend-webhook', { method: 'PATCH', json: { enabled: data?.webhook?.status !== 'enabled' } })
      setData(next); toast.success(next.webhook?.status === 'enabled' ? 'Webhook activé chez Resend' : 'Webhook désactivé chez Resend')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <Card id="resend-webhook" className="scroll-mt-6"><CardHeader title="Webhook Resend en un clic" description="Créez le webhook dans votre compte et enregistrez son secret automatiquement. Aucun email n’est envoyé par cette action." actions={data?.webhook ? <Badge tone={data.webhook.status === 'enabled' ? 'success' : 'neutral'}>{data.webhook.status === 'enabled' ? 'Activé' : 'Désactivé'}</Badge> : undefined}/><CardBody className="space-y-5">
    {error ? <Notice tone="warning" title="Configuration à vérifier">{error}{!data ? <Button className="mt-3" size="sm" variant="outline" onClick={load}>Réessayer</Button> : null}</Notice> : null}
    {!data && !error ? <p role="status" className="text-sm text-muted">Chargement de Resend…</p> : null}
    {data ? <>
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); void configure() }}>
        <div className="grid gap-5 lg:grid-cols-2"><Field label="Clé API Resend pour le webhook" hint={data.keyConfigured ? 'Clé déjà enregistrée. Laissez vide pour la conserver ; les droits Full access sont nécessaires.' : 'Créez une clé Full access dans Resend → API keys. Une clé limitée à l’envoi ne peut pas créer de webhook.'}><Input type="password" autoComplete="new-password" maxLength={500} placeholder={data.keyConfigured ? 'Enregistrée' : 're_…'} value={key} disabled={busy} onChange={e => setKey(e.target.value)}/></Field><Field label="Adresse publique pour Resend" hint="Votre application hébergée, ou l’adresse HTTPS d’un tunnel vers votre Mac. Ex. https://mon-app.fr"><Input type="url" required placeholder="https://votre-adresse-publique.fr" value={base} disabled={busy} onChange={e => setBase(e.target.value)}/></Field></div>
        <div className="flex flex-wrap gap-3"><Button type="submit" loading={busy} disabled={!base.trim() || (!key.trim() && !data.keyConfigured)}><WandSparkles/>Créer le webhook Resend</Button>{data.webhook ? <Button type="button" variant="outline" disabled={busy} onClick={toggle}><Power/>{data.webhook.status === 'enabled' ? 'Désactiver le webhook' : 'Activer le webhook'}</Button> : null}</div>
      </form>
      {data.webhook ? <Notice tone={data.secretConfigured ? 'success' : 'warning'} title={data.secretConfigured ? 'Secret enregistré automatiquement et masqué' : 'Secret à reconnecter'}><p className="break-all">{data.webhook.endpoint}</p><p className="mt-2">Le bouton réutilise le webhook de cette adresse pour éviter les doublons. Son état affiché correspond à la dernière configuration enregistrée.</p></Notice> : null}
      <p className="text-xs leading-6 text-muted">Événements configurés : {RESEND_WEBHOOK_EVENTS.join(', ')}. Ils suivent les livraisons, rebonds et plaintes ; les réponses à vos emails se relèvent avec IMAP.</p>
      <details className="ui-details"><summary>Mini tuto · tester depuis mon Mac</summary><ol className="list-decimal space-y-3 pl-4 text-xs leading-6 text-muted"><li>Dans <a className="text-primary underline" href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer">Resend → API keys</a>, créez une clé avec les droits Full access, puis collez-la ci-dessus.</li><li>Si votre application est déjà hébergée en HTTPS, utilisez son adresse. Sur Mac, installez Cloudflare Tunnel une seule fois : <Command value="brew install cloudflared"/>Puis ouvrez un tunnel vers l’application : <Command value="cloudflared tunnel --url http://localhost:3000"/></li><li>Copiez l’adresse HTTPS affichée par le tunnel dans « Adresse publique pour Resend », puis cliquez sur « Créer le webhook Resend ». Le secret est récupéré et chiffré sans copier-coller.</li><li>Gardez l’application et le tunnel ouverts pendant vos essais. Une adresse de tunnel temporaire peut changer au redémarrage : reconfigurez alors le webhook avec sa nouvelle adresse. Les anciennes adresses restent dans votre compte Resend ; retirez-les depuis son tableau de bord si vous ne les utilisez plus.</li></ol><a className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary" href="https://resend.com/webhooks" target="_blank" rel="noopener noreferrer">Ouvrir mes webhooks Resend<ExternalLink size={13}/></a></details>
    </> : null}
  </CardBody></Card>
}

function Command({ value }: { value: string }) {
  return <span className="my-2 flex flex-wrap items-center gap-2 rounded-xl bg-panel-2 p-3"><code className="min-w-0 flex-1 break-all text-[11px]">{value}</code><Button type="button" size="sm" variant="ghost" aria-label={`Copier ${value}`} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Commande copiée')).catch(() => toast.error('Copie impossible'))}><Copy size={14}/></Button></span>
}
