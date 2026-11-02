'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const OPTS = [
  { k: 'today', l: 'Aujourd’hui' },
  { k: '7d', l: '7 jours' },
  { k: '30d', l: '30 jours' },
  { k: '90d', l: '90 jours' },
]

export function PeriodFilter() {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const cur = sp.get('period') ?? '30d'
  const go = (q: Record<string, string>) => router.push(`${path}?${new URLSearchParams(q)}`)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-border bg-panel p-0.5">
        {OPTS.map((o) => (
          <button key={o.k} onClick={() => go({ period: o.k })} className={cn('rounded-md px-2.5 py-1 text-xs text-muted', cur === o.k && 'bg-panel-2 font-medium text-fg')}>
            {o.l}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          go({ period: 'custom', from: String(fd.get('from')), to: String(fd.get('to')) })
        }}
      >
        <input type="date" name="from" defaultValue={sp.get('from') ?? ''} required aria-label="Début" className="h-8 rounded-md border border-border bg-panel px-2 text-xs" />
        <input type="date" name="to" defaultValue={sp.get('to') ?? ''} required aria-label="Fin" className="h-8 rounded-md border border-border bg-panel px-2 text-xs" />
        <button className={cn('h-8 rounded-md border border-border px-2 text-xs', cur === 'custom' && 'bg-panel-2 font-medium')}>Appliquer</button>
      </form>
    </div>
  )
}
