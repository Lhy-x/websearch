import { Badge } from './ui/primitives'
import { EMAIL_STATUS, PIPELINE_BY_ID, PRESENCE } from '@/lib/labels'
import { cn } from '@/lib/utils'

export function PresenceBadge({ status }: { status: string }) {
  const p = PRESENCE[status] ?? { label: status, tone: 'neutral' as const }
  return <Badge tone={p.tone}>{p.label}</Badge>
}
export function PipelineBadge({ status }: { status: string }) {
  const p = PIPELINE_BY_ID[status] ?? { label: status, tone: 'neutral' as const }
  return <Badge tone={p.tone}>{p.label}</Badge>
}
export function EmailBadge({ status }: { status: string }) {
  const p = EMAIL_STATUS[status] ?? { label: status, tone: 'neutral' as const }
  return <Badge tone={p.tone}>{p.label}</Badge>
}
export function ScorePill({ score, priority }: { score: number | null; priority?: string | null }) {
  if (score == null) return <span className="text-xs text-muted">—</span>
  const tone = score >= 75 ? 'bg-success/15 text-success' : score >= 55 ? 'bg-primary/15 text-primary' : score >= 35 ? 'bg-warning/15 text-warning' : 'bg-panel-2 text-muted'
  return (
    <span className={cn('tabular inline-flex min-w-[46px] items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold', tone)}>
      {score}
      {priority ? <span className="text-[10px] font-medium opacity-80">{priority}</span> : null}
    </span>
  )
}
