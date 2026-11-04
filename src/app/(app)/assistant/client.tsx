'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Bot, Check, Play, Send, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, Notice, Table, Td, Th } from '@/components/ui/primitives'
import { ensureWorkspaceStorage,useSelection } from '@/components/selection'
import { api } from '@/lib/utils'

interface ToolResult { summary: string; rows?: Record<string, unknown>[]; links?: { label: string; href: string }[] }
interface Step { id: string; tool: string; kind: 'read' | 'action'; input: Record<string, unknown>; status: 'done' | 'needs_confirmation' | 'error'; result?: ToolResult; error?: string; executed?: ToolResult }
interface Turn { id: string; question: string; interpreter?: string; note?: string | null; steps?: Step[]; pending?: boolean }

const EXAMPLES = [
  'Recherche les entreprises de nettoyage à Rouen sans site confirmé.',
  'Génère une démonstration pour les cinq prospects les mieux qualifiés.',
  'Prépare une campagne pour ces prospects.',
  'Montre-moi les campagnes ayant le meilleur taux de réponse.',
  'Quelles conversations nécessitent mon attention ?',
]
const TOOL_LABELS: Record<string, string> = { search_prospects: 'Recherche de prospects', list_prospects: 'Liste de prospects', generate_sites: 'Génération de sites', prepare_campaign: 'Préparation de campagne', campaign_performance: 'Performance des campagnes', conversations_needing_attention: 'Conversations à traiter', pipeline_summary: 'Pipeline' }
const KEY = 'pf-assistant-history'

export function AssistantClient() {
  const sel = useSelection()
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try {
      ensureWorkspaceStorage(sel.workspaceEpoch)
      const raw = localStorage.getItem(KEY)
      if (raw) setTurns((JSON.parse(raw) as Turn[]).filter((t) => !t.pending))
    } catch {
      /* ignore */
    }
  }, [sel.workspaceEpoch])
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(turns.slice(-30)))
    } catch {
      /* ignore */
    }
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  const ask = async (q: string) => {
    if (!q.trim()) return
    const id = crypto.randomUUID()
    setTurns((t) => [...t, { id, question: q, pending: true }])
    setText('')
    try {
      const r = await api<{ interpreter: string; note: string | null; steps: Step[] }>('/api/assistant', { method: 'POST', json: { message: q, selection: [...sel.ids] } })
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, ...r, pending: false } : x)))
    } catch (e) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, pending: false, note: (e as Error).message, steps: [] } : x)))
    }
  }
  const execute = async (turnId: string, step: Step) => {
    try {
      const r = await api<ToolResult>('/api/assistant/execute', { method: 'POST', json: { tool: step.tool, input: step.input } })
      setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, steps: x.steps?.map((s) => (s.id === step.id ? { ...s, executed: r } : s)) } : x)))
      toast.success(r.summary)
      const ids = (step.result?.rows ?? []).map((row) => row.id).filter((v): v is string => typeof v === 'string')
      if (step.tool === 'generate_sites' && ids.length) sel.setMany(ids, true)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {!turns.length ? (
        <Card className="p-5">
          <p className="mb-3 text-sm text-muted">Exemples :</p>
          <div className="flex flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} onClick={() => ask(e)} className="rounded-lg border border-border px-3 py-1.5 text-left text-xs hover:border-primary/50 hover:bg-panel-2">{e}</button>)}</div>
        </Card>
      ) : null}
      {turns.map((t) => (
        <div key={t.id} className="space-y-2">
          <div className="flex items-start gap-2"><div className="grid size-7 shrink-0 place-items-center rounded-full bg-panel-2"><User className="size-3.5" /></div><p className="rounded-xl bg-panel-2 px-3.5 py-2 text-sm">{t.question}</p></div>
          <div className="flex items-start gap-2">
            <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-fg"><Bot className="size-3.5" /></div>
            <div className="min-w-0 flex-1 space-y-2">
              {t.pending ? <p className="text-sm text-muted">Analyse…</p> : null}
              {t.interpreter ? <p className="text-[11px] text-muted">Interprété par {t.interpreter}</p> : null}
              {t.note ? <Notice tone="info">{t.note}</Notice> : null}
              {t.steps?.map((s) => (
                <Card key={s.id} className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                    <p className="text-sm font-medium">{TOOL_LABELS[s.tool] ?? s.tool} <Badge tone={s.kind === 'action' ? 'warning' : 'neutral'}>{s.kind === 'action' ? 'action' : 'lecture'}</Badge></p>
                    {s.status === 'needs_confirmation' && !s.executed ? <Button size="sm" onClick={() => execute(t.id, s)}><Play />Exécuter</Button> : null}
                    {s.executed ? <Badge tone="success"><Check className="size-3" />exécutée</Badge> : null}
                  </div>
                  <div className="space-y-2 px-4 py-3 text-sm">
                    {s.error ? <p className="text-danger">{s.error}</p> : null}
                    {s.result ? <p>{s.result.summary}</p> : null}
                    {s.result?.rows?.length ? <ResultTable rows={s.result.rows} /> : null}
                    {s.executed ? <p className="text-success">{s.executed.summary}</p> : null}
                    {[...(s.executed?.links ?? []), ...(s.result?.links ?? [])].slice(0, 8).map((l) => <Link key={l.href} href={l.href} className="mr-3 text-xs text-primary">{l.label} →</Link>)}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      ))}
      <div ref={end} />
      <form className="sticky bottom-4 flex gap-2 rounded-2xl border border-border bg-panel p-2 shadow-lg" onSubmit={(e) => { e.preventDefault(); void ask(text) }}>
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Votre demande" placeholder={sel.ids.size ? `Demande (${sel.ids.size} prospect(s) sélectionné(s) = « ces prospects »)` : 'Ex. : recherche les plombiers à Lyon sans site'} className="h-10 min-w-0 flex-1 rounded-xl bg-transparent px-3 text-sm outline-none" />
        <Button type="submit" disabled={!text.trim()}><Send />Envoyer</Button>
      </form>
    </div>
  )
}

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0]!).filter((c) => c !== 'id')
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
      <Table>
        <thead><tr>{cols.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c, k) => <Td key={c} className="text-xs">{k === 0 && typeof r.id === 'string' && /^[0-9a-f-]{36}$/.test(r.id) && (cols.includes('Nom') || cols.includes('Prospect')) ? <Link className="text-primary" href={cols.includes('Prospect') ? `/inbox?c=${r.id}` : `/prospects/${r.id}`}>{String(r[c] ?? '—')}</Link> : String(r[c] ?? '—')}</Td>)}</tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}
