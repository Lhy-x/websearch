'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, Field, Notice, Select, Table, Td, Th } from '@/components/ui/primitives'
import { PresenceBadge, ScorePill } from '@/components/badges'
import { useSelection } from '@/components/selection'
import { TEMPLATES } from '@/lib/site/templates'
import { STYLES } from '@/lib/site/schema'
import { SECTOR_BY_ID } from '@/lib/sectors'
import { JOB_STATUS } from '@/lib/labels'
import { api, fmtRelative, fmtUsd } from '@/lib/utils'

interface Candidate { id: string; name: string; city: string | null; sector: string | null; score: number | null; web_presence_status: string; sites: number }

export function GeneratorClient({ candidates, preselect, jobs }: { candidates: Candidate[]; preselect: string | null; jobs: { id: string; status: string; error: string | null; created_at: string; result: { websiteId?: string } | null; name: string | null }[] }) {
  const router = useRouter()
  const sel = useSelection()
  const [templateId, setTemplateId] = useState('')
  const [style, setStyle] = useState('')
  const [generator, setGenerator] = useState('auto')
  const [variants, setVariants] = useState(1)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (preselect) sel.setMany([preselect], true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect])
  const chosen = [...sel.ids]
  const count = chosen.length * variants
  const est = useQuery({ queryKey: ['est', count, generator], queryFn: () => api<{ ai: boolean; model: string | null; perItemUsd: number | null; totalUsd: number | null; note: string }>(`/api/estimate?task=${generator === 'ai' ? 'site_generation' : 'site_bespoke'}&count=${Math.max(1, count)}`), enabled: generator !== 'deterministic' })
  useEffect(() => {
    if (jobs.some((j) => ['PENDING', 'RUNNING', 'RETRYING'].includes(j.status))) {
      const t = setTimeout(() => router.refresh(), 2500)
      return () => clearTimeout(t)
    }
  }, [jobs, router])
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader title="Prospects" description="Sélection partagée avec la base de prospects (persistante)." />
        <Table>
          <thead><tr><Th className="w-8" /><Th>Score</Th><Th>Établissement</Th><Th>Présence web</Th><Th>Démos</Th></tr></thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id} className={sel.has(c.id) ? 'bg-primary/5' : ''}>
                <Td><input type="checkbox" checked={sel.has(c.id)} onChange={() => sel.toggle(c.id)} aria-label={c.name} /></Td>
                <Td><ScorePill score={c.score} /></Td>
                <Td><Link className="font-medium hover:text-primary" href={`/prospects/${c.id}`}>{c.name}</Link><div className="text-xs text-muted">{[c.sector ? SECTOR_BY_ID.get(c.sector)?.label : null, c.city].filter(Boolean).join(' · ')}</div></Td>
                <Td><PresenceBadge status={c.web_presence_status} /></Td>
                <Td className="text-xs">{c.sites || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Options" />
          <CardBody className="space-y-3">
            <Field label="Template"><Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Automatique (selon le secteur)</option>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Style imposé"><Select value={style} onChange={(e) => setStyle(e.target.value)}><option value="">Libre</option>{STYLES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</Select></Field>
            <Field label="Moteur"><Select value={generator} onChange={(e) => setGenerator(e.target.value)}><option value="auto">Automatique (sur mesure si l’IA est disponible)</option><option value="bespoke">Sur mesure (IA — qualité maximale)</option><option value="ai">Template + textes IA</option><option value="deterministic">Template déterministe (gratuit)</option></Select></Field>
            <Field label="Variantes par prospect" hint="Plusieurs styles différents pour le même prospect"><Select value={variants} onChange={(e) => setVariants(Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
            {generator !== 'deterministic' && est.data ? (
              <Notice tone="info" title={est.data.ai ? `Coût estimé : ${est.data.totalUsd != null ? fmtUsd(est.data.totalUsd) : 'inconnu'} pour ${count} génération(s)` : 'Aucun coût IA'}>{est.data.note}</Notice>
            ) : null}
            <Button
              className="w-full"
              disabled={!chosen.length}
              loading={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const styles = style ? [style] : variants > 1 ? STYLES.filter((s) => ['moderne', 'elegant', 'minimaliste', 'premium', 'artisanal'].includes(s)) : [null]
                  let queued = 0
                  for (let v = 0; v < variants; v++) {
                    const r = await api<{ queued: number }>('/api/prospects/bulk', { method: 'POST', json: { ids: chosen, action: 'generate_site', generator, templateId: templateId || undefined, style: (styles[v % styles.length] as string | null) ?? undefined } })
                    queued += r.queued
                  }
                  toast.success(`${queued} génération(s) en file d’attente`)
                  router.refresh()
                } catch (e) {
                  toast.error((e as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Sparkles />Générer {count || ''} site(s)
            </Button>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Générations récentes" />
          <ul className="divide-y divide-border text-xs">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 truncate">{j.name ?? '—'}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={JOB_STATUS[j.status]}>{j.status}</Badge>
                  {j.result?.websiteId ? <Link className="text-primary" href={`/sites/${j.result.websiteId}`}>Ouvrir</Link> : <span className="text-muted">{fmtRelative(j.created_at)}</span>}
                </span>
              </li>
            ))}
            {!jobs.length ? <li className="px-4 py-3 text-muted">Aucune génération.</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  )
}
