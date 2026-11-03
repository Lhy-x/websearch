'use client'
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children?: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[#10291c]/35 backdrop-blur-sm" />
        <D.Content className={cn('fixed left-1/2 top-1/2 z-50 max-h-[90svh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-border bg-panel shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
          <div className="flex items-start justify-between border-b border-border px-6 py-5">
            <div>
              <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>
              {description ? <D.Description className="mt-2 text-xs leading-relaxed text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Fermer"><X className="size-4" /></D.Close>
          </div>
          <div className="px-6 py-5">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export function Drawer({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <D.Content className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-panel shadow-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-border bg-panel px-6 py-5">
            <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>
            <D.Description className="sr-only">{title}</D.Description>
            <D.Close className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Fermer"><X className="size-4" /></D.Close>
          </div>
          <div className="p-5">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

/** Confirmation for destructive actions. */
export function ConfirmButton({ label, title, description, confirmLabel = 'Confirmer', onConfirm, variant = 'danger', size = 'sm', icon, disabled }: { label: React.ReactNode; title: string; description: string; confirmLabel?: string; onConfirm: () => Promise<void> | void; variant?: 'danger' | 'outline' | 'default' | 'secondary'; size?: 'sm' | 'md'; icon?: React.ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Button variant={variant === 'danger' ? 'outline' : variant} size={size} onClick={() => setOpen(true)} disabled={disabled} className={variant === 'danger' ? 'text-danger' : undefined}>
        {icon}
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              variant={variant === 'danger' ? 'danger' : 'default'}
              loading={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onConfirm()
                  setOpen(false)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      />
    </>
  )
}
