'use client'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardHeader, EmptyState, Badge, Notice } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { fmtDate, fmtUsd } from '@/lib/utils'

const VARIANTS: [string, string][] = [['initial', 'Email initial'], ['short', 'Courte'], ['direct', 'Directe'], ['personalized', 'Personnalisée'], ['followup1', 'Relance 1'], ['followup2', 'Relance 2'], ['objection', 'Objection'], ['meeting', 'Rendez-vous']]

export function ProposalViewer({ proposals }: { proposals: { id: string; content: Record<string, { subject: string; body: string }> & { subjects?: string[]; rejected?: string[] }; generator: string; model: string | null; cost_usd: string; created_at: string }[] }) {
  const [v, setV] = useState('initial')
  const p = proposals[0]
  if (!p) return <Card><CardHeader title="Propositions commerciales" /><EmptyState title="Aucune proposition" description="« Créer une proposition » rédige 8 variantes à partir des faits vérifiés." /></Card>
  const cur = p.content[v]
  return (
    <Card>
      <CardHeader title="Proposition commerciale" description={`${p.generator}${p.model ? ` · ${p.model}` : ''} · ${fmtUsd(p.cost_usd)} · ${fmtDate(p.created_at)}`} />
      <div className="flex flex-wrap gap-1 border-b border-border px-5 py-2">
        {VARIANTS.map(([k, l]) => <button key={k} onClick={() => setV(k)} className={`rounded-md px-2 py-1 text-xs ${v === k ? 'bg-panel-2 font-medium' : 'text-muted'}`}>{l}</button>)}
      </div>
      <div className="space-y-3 p-5">
        {p.content.rejected?.length ? <Notice tone="warning" title="Garde-fou anti-invention">Variantes IA remplacées par la version déterministe : {p.content.rejected.join(' ; ')}</Notice> : null}
        {cur ? (
          <>
            <p className="text-sm"><span className="text-muted">Objet :</span> <strong>{cur.subject}</strong></p>
            <pre className="whitespace-pre-wrap rounded-lg bg-panel-2 p-4 font-sans text-sm">{cur.body}</pre>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(`${cur.subject}\n\n${cur.body}`); toast.success('Copié') }}><Copy />Copier</Button>
              {p.content.subjects?.length ? <span className="text-xs text-muted">Objets alternatifs : {p.content.subjects.map((s) => <Badge key={s} className="ml-1">{s}</Badge>)}</span> : null}
            </div>
          </>
        ) : null}
      </div>
    </Card>
  )
}
