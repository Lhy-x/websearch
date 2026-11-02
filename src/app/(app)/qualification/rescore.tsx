'use client'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/utils'

export function RescoreButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button variant="outline" loading={busy} onClick={async () => {
      setBusy(true)
      try {
        const r = await api<{ updated: number }>('/api/qualification/rescore', { method: 'POST', json: {} })
        toast.success(`${r.updated} score(s) recalculé(s)`)
        router.refresh()
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setBusy(false)
      }
    }}><RefreshCw />Recalculer tous les scores</Button>
  )
}
