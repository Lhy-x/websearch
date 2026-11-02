import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn('h-9 w-full rounded-lg border border-border bg-panel px-3 text-sm placeholder:text-muted disabled:opacity-60', className)} {...p} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn('w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm placeholder:text-muted', className)} {...p} />
))
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn('h-9 w-full rounded-lg border border-border bg-panel px-2.5 text-sm', className)} {...p}>
    {children}
  </select>
))
Select.displayName = 'Select'

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-xs font-medium text-muted', className)} {...p} />
}

/** Form field. Wraps a single control in its <label> (accessible name); `group` for multi-control fields. */
export function Field({ label, hint, children, className, group }: { label: string; hint?: string; children: React.ReactNode; className?: string; group?: boolean }) {
  if (group)
    return (
      <div className={className} role="group" aria-label={label}>
        <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
        {children}
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </div>
    )
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
        {children}
      </label>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-panel', className)} {...p} />
}
export function CardHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-border px-5 py-4', className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  )
}
export function CardBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...p} />
}

const TONES = {
  neutral: 'bg-panel-2 text-muted border-border',
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger: 'bg-danger/10 text-danger border-danger/25',
  info: 'bg-info/10 text-info border-info/25',
  primary: 'bg-primary/10 text-primary border-primary/25',
} as const
export type Tone = keyof typeof TONES
export function Badge({ tone = 'neutral', className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium', TONES[tone], className)} {...p} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-panel-2', className)} />
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon ? <div className="mb-1 rounded-xl bg-panel-2 p-3 text-muted [&_svg]:size-5">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-md text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', className)} {...p} />
    </div>
  )
}
export function Th({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('whitespace-nowrap border-b border-border px-3 py-2 text-left text-xs font-medium text-muted', className)} {...p} />
}
export function Td({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-border/60 px-3 py-2.5 align-middle', className)} {...p} />
}

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-lg border px-3.5 py-2.5 text-xs', TONES[tone])}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      <div className="text-fg/80">{children}</div>
    </div>
  )
}
