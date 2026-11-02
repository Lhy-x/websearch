import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Shell } from '@/components/shell'
import { SelectionProvider } from '@/components/selection'
import { BulkBar } from '@/components/bulk-bar'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { getFlags } from '@/server/core/settings'
import { sql } from '@/server/core/db'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value)
  if (!session) redirect('/login')
  const [flags, [unread]] = await Promise.all([getFlags(), sql()<{ n: number }[]>`select count(*)::int n from conversations where unread`])
  return (
    <SelectionProvider>
      <Shell flags={flags} unread={unread?.n ?? 0}>{children}</Shell>
      <BulkBar />
    </SelectionProvider>
  )
}
