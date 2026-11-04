import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Shell } from '@/components/shell'
import { SelectionProvider } from '@/components/selection'
import { BulkBar } from '@/components/bulk-bar'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { getSettings,getFlags } from '@/server/core/settings'
import { sql } from '@/server/core/db'
import { WorkspaceProgressProvider } from '@/components/workspace-progress'
import { workspaceProgress } from '@/server/analytics/progress'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value)
  if (!session) redirect('/login')
  const [settings,flags, [unread],progress] = await Promise.all([getSettings(),getFlags(), sql()<{ n: number }[]>`select count(*)::int n from conversations where unread`,workspaceProgress()])
  return (
    <SelectionProvider key={settings.workspaceEpoch} workspaceEpoch={settings.workspaceEpoch}>
      <WorkspaceProgressProvider initial={progress}><Shell flags={flags} unread={unread?.n ?? 0}>{children}</Shell></WorkspaceProgressProvider>
      <BulkBar />
    </SelectionProvider>
  )
}
