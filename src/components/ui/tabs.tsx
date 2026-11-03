'use client'
import * as T from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = T.Root
export function TabsList({ className, ...p }: T.TabsListProps) {
  return <T.List className={cn('inline-flex max-w-full flex-wrap gap-1.5 rounded-2xl border border-border bg-panel p-1.5', className)} {...p} />
}
export function TabsTrigger({ className, ...p }: T.TabsTriggerProps) {
  return <T.Trigger className={cn('min-h-10 rounded-xl px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-panel-2 data-[state=active]:bg-primary data-[state=active]:text-primary-fg', className)} {...p} />
}
export function TabsContent({ className, ...p }: T.TabsContentProps) {
  return <T.Content className={cn('mt-6 min-w-0 outline-none', className)} {...p} />
}
