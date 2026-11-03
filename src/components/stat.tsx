import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Stat({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: 'danger' | 'success' }) {
  const inner = (
    <div className={cn('app-card h-full rounded-3xl border border-border bg-panel px-6 py-6 transition-colors', href && 'hover:border-primary/40')}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('tabular mt-4 text-4xl font-medium tracking-[-.04em]', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success')}>{value}</p>
      {hint ? <p className="mt-3 text-[11px] text-muted">{hint}</p> : null}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}
