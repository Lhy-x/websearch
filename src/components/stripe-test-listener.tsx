'use client'

import { useEffect, useState } from 'react'
import { Copy, Loader2, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/utils'
import type { StripeListenerStatus } from '@/lib/stripe-listener'
import { Button } from './ui/button'
import { Badge, Notice } from './ui/primitives'

export function StripeTestListenerPanel({ apiKey, onConfigured, onActiveChange }: {
  apiKey: string
  onConfigured: () => Promise<void>
  onActiveChange: (active: boolean) => void
}) {
  const [status, setStatus] = useState<StripeListenerStatus | null>(null)
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null)
  const [error, setError] = useState('')
  const [connectionError, setConnectionError] = useState('')

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      if (busy || document.hidden) return
      try {
        const next = await api<StripeListenerStatus>('/api/billing/test-listener')
        if (!cancelled) { setStatus(next); setConnectionError('') }
      } catch (e) { if (!cancelled) setConnectionError((e as Error).message) }
      finally { if (!cancelled) timer = setTimeout(refresh, 3000) }
    }
    function visibility() { clearTimeout(timer); if (!document.hidden) void refresh() }
    void refresh()
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [busy])

  const active = status?.state === 'running' || status?.state === 'starting' || status?.state === 'stopping'
  useEffect(() => { onActiveChange(active || !!busy) }, [active, busy, onActiveChange])

  async function change(action: 'start' | 'stop') {
    setBusy(action); setError('')
    try {
      const next = await api<StripeListenerStatus>('/api/billing/test-listener', action === 'start'
        ? { method: 'POST', json: { ...(apiKey.trim() ? { key: apiKey.trim() } : {}) } }
        : { method: 'DELETE' })
      setStatus(next)
      if (action === 'start') { await onConfigured(); toast.success('Relais actif : secret du webhook enregistré automatiquement') }
      else toast.success('Relais de test arrêté')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(null) }
  }

  return <section aria-label="Webhook de test automatique" className="mt-5 space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Webhook de test en un clic</h3><p className="mt-2 max-w-xl text-xs leading-6 text-muted">Collez votre clé <code>sk_test_…</code> ci-dessus, puis démarrez. Le secret du webhook est récupéré et enregistré automatiquement. Aucun paiement n’est lancé.</p></div><Badge tone={status?.state === 'running' ? 'success' : status?.state === 'error' ? 'warning' : 'neutral'}>{busy === 'start' || status?.state === 'starting' ? 'Connexion…' : status?.state === 'running' ? 'Actif' : status?.state === 'stopping' ? 'Arrêt…' : 'Arrêté'}</Badge></div>
    {!status && !error && !connectionError ? <p role="status" className="flex items-center gap-2 text-xs text-muted"><Loader2 className="size-3 animate-spin"/>Vérification du relais…</p> : null}
    {status?.state === 'running' ? <p role="status" className="text-xs leading-6 text-success">Secret enregistré automatiquement et masqué. Les événements Stripe de test sont transmis à l’application.</p> : null}
    {error || connectionError || status?.error ? <Notice tone="warning" title="Le relais demande votre attention">{error || connectionError || status?.error}</Notice> : null}
    <div className="flex flex-wrap gap-3"><Button size="sm" loading={busy === 'start'} disabled={!!busy || !!active || !status?.cliAvailable} onClick={() => change('start')}><Play/>Générer et démarrer</Button><Button size="sm" variant="outline" loading={busy === 'stop'} disabled={!!busy || !active} onClick={() => change('stop')}><Square/>Arrêter</Button></div>
    <p className="text-xs leading-6 text-muted">Démarrer enregistre votre clé de test et remplace le secret du webhook actuel. Arrêter conserve ces clés.</p>
    {status && !status.cliAvailable ? <Notice title="Installer Stripe une seule fois sur votre Mac"><p className="mb-3">Copiez cette commande dans le Terminal, puis revenez cliquer sur démarrer. Aucune connexion avec stripe login n’est nécessaire.</p><div className="flex flex-wrap items-center gap-3"><code className="min-w-0 break-all text-xs">brew install stripe/stripe-cli/stripe</code><Button size="sm" variant="outline" aria-label="Copier la commande d’installation Stripe" onClick={() => navigator.clipboard.writeText('brew install stripe/stripe-cli/stripe').then(() => toast.success('Commande copiée')).catch(() => toast.error('Copie impossible'))}><Copy/>Copier</Button></div></Notice> : null}
    <p className="text-xs leading-6 text-muted">Laissez l’application ouverte pendant vos essais. Le relais tourne sur la machine qui héberge ProspectForge et s’arrête avec son serveur. Après un redémarrage, cliquez sur démarrer. Pour les ventes réelles, utilisez un webhook permanent dans votre compte Stripe.</p>
  </section>
}
