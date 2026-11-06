'use client'
import Link from 'next/link'
import { ArrowUpRight, Globe, Mail, Phone } from 'lucide-react'
import { useState,useEffect } from 'react'
import {useRouter} from 'next/navigation'
import type {BusinessSummary} from '@/lib/business-summary'
import {SummaryPreview} from './business-summary'
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
  summary?:BusinessSummary|null
  enriching?:boolean
}

export function ProspectTable({ rows,live=true }: { rows: ProspectRow[];live?:boolean }) {
  const router=useRouter(),enriching=rows.some(row=>row.enriching)
  useEffect(()=>{if(!live||!enriching)return;const interval=setInterval(()=>router.refresh(),4500);return()=>clearInterval(interval)},[live,enriching,router])
  const [detailed,setDetailed]=useState(false)
  const sel = useSelection()
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id))
  return (
    <><div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><p className="text-[11px] text-muted">Ouvrez une entreprise pour consulter sa fiche.</p><button className="text-[11px] font-medium text-primary" aria-pressed={detailed} onClick={()=>setDetailed(!detailed)}>{detailed?'Masquer les détails':'Afficher les détails des sources'}</button></div><Table>
      <thead>
        <tr>
          <Th className="w-8"><input type="checkbox" aria-label="Tout sélectionner" checked={all} onChange={(e) => sel.setMany(rows.map((r) => r.id), e.target.checked)} /></Th>
          <Th>Score</Th>
          <Th>Établissement</Th>
          <Th>Présence web</Th>
          <Th>Contact</Th>
          <Th>Statut</Th>
          {detailed?<><Th className="text-right">Confiance</Th><Th>Sources</Th></>:null}<Th><span className="sr-only">Prochaine action</span></Th>
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
              <SummaryPreview summary={r.summary}/>
              {r.enriching?<p role="status" className="mt-1 text-[11px] text-primary">Activité et avantages en cours d’enrichissement…</p>:null}
              <Link href={`/prospects/${r.id}#recap`} className="mt-1 inline-block text-[11px] font-medium text-primary">Voir le récapitulatif</Link>
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
            {detailed?<><Td className="tabular text-right text-xs text-muted">{r.data_confidence ?? '—'}</Td><Td className="text-[11px] text-muted">{r.sources.join(', ')}</Td></>:null}<Td><Link href={r.sites?`/prospects/${r.id}#demos`:`/generator?business=${r.id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary">{r.sites?'Voir les démos':'Créer un site'}<ArrowUpRight size={14}/></Link></Td>
          </tr>
        ))}
      </tbody>
    </Table><p className="px-5 py-3 text-[10px] text-muted sm:hidden">Faites défiler le tableau horizontalement pour voir toutes les informations.</p></>
  )
}
