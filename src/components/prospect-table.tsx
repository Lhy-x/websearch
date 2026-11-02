'use client'
import Link from 'next/link'
import { Globe, Mail, Phone } from 'lucide-react'
import { useSelection } from './selection'
import { EmailBadge, PipelineBadge, PresenceBadge, ScorePill } from './badges'
import { Table, Td, Th } from './ui/primitives'
import { SECTOR_BY_ID } from '@/lib/sectors'
import { formatPhone } from '@/lib/phone'

export interface ProspectRow {
  id: string
  name: string
  sector: string | null
  city: string | null
  postcode: string | null
  phone: string | null
  email: string | null
  email_status: string
  website_url: string | null
  web_presence_status: string
  pipeline_status: string
  score: number | null
  data_confidence: number | null
  priority: string | null
  sources: string[]
  sites: number
}

export function ProspectTable({ rows }: { rows: ProspectRow[] }) {
  const sel = useSelection()
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id))
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-8"><input type="checkbox" aria-label="Tout sélectionner" checked={all} onChange={(e) => sel.setMany(rows.map((r) => r.id), e.target.checked)} /></Th>
          <Th>Score</Th>
          <Th>Établissement</Th>
          <Th>Présence web</Th>
          <Th>Contact</Th>
          <Th>Statut</Th>
          <Th className="text-right">Confiance</Th>
          <Th>Sources</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={sel.has(r.id) ? 'bg-primary/5' : 'hover:bg-panel-2/60'}>
            <Td><input type="checkbox" aria-label={`Sélectionner ${r.name}`} checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)} /></Td>
            <Td><ScorePill score={r.score} priority={r.priority} /></Td>
            <Td className="min-w-[220px]">
              <Link href={`/prospects/${r.id}`} className="font-medium hover:text-primary">{r.name}</Link>
              <div className="text-xs text-muted">{[r.sector ? SECTOR_BY_ID.get(r.sector)?.label ?? r.sector : null, [r.postcode, r.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</div>
            </Td>
            <Td>
              <PresenceBadge status={r.web_presence_status} />
              {r.website_url ? <a href={r.website_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 flex max-w-[200px] items-center gap-1 truncate text-xs text-muted hover:text-primary"><Globe className="size-3" />{r.website_url.replace(/^https?:\/\/(www\.)?/, '')}</a> : null}
              {r.sites ? <div className="mt-0.5 text-[11px] text-primary">{r.sites} démo(s)</div> : null}
            </Td>
            <Td className="text-xs">
              {r.email ? <div className="flex items-center gap-1"><Mail className="size-3 text-muted" /><span className="max-w-[200px] truncate">{r.email}</span></div> : null}
              {r.email ? <div className="mt-0.5"><EmailBadge status={r.email_status} /></div> : <span className="text-muted">Aucun email</span>}
              {r.phone ? <div className="mt-0.5 flex items-center gap-1 text-muted"><Phone className="size-3" />{formatPhone(r.phone)}</div> : null}
            </Td>
            <Td><PipelineBadge status={r.pipeline_status} /></Td>
            <Td className="tabular text-right text-xs text-muted">{r.data_confidence ?? '—'}</Td>
            <Td className="text-[11px] text-muted">{r.sources.join(', ')}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
