'use client'
import * as T from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = T.Root
export function TabsList({ className, ...p }: T.TabsListProps) {
  return <T.List className={cn('inline-flex gap-1 rounded-lg border border-border bg-panel-2 p-1', className)} {...p} />
}
export function TabsTrigger({ className, ...p }: T.TabsTriggerProps) {
  return <T.Trigger className={cn('rounded-md px-3 py-1.5 text-xs font-medium text-muted data-[state=active]:bg-panel data-[state=active]:text-fg data-[state=active]:shadow-sm', className)} {...p} />
}
export function TabsContent({ className, ...p }: T.TabsContentProps) {
  return <T.Content className={cn('mt-4 outline-none', className)} {...p} />
}
