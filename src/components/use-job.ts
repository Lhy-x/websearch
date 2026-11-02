'use client'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/utils'

/** Watch a background job: toast progress, refresh the page when it completes. */
export function useJobRunner() {
  const router = useRouter()
  return useCallback(
    async (label: string, start: () => Promise<{ jobId?: string }>) => {
      let jobId: string | undefined
      try {
        jobId = (await start()).jobId
      } catch (e) {
        toast.error((e as Error).message)
        return
      }
      if (!jobId) return
      const t = toast.loading(`${label} — en file d’attente…`)
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        const { job } = await api<{ job: { status: string; error: string | null; progress_message: string | null } }>(`/api/jobs/${jobId}`).catch(() => ({ job: { status: 'UNKNOWN', error: null, progress_message: null } }))
        if (job.status === 'COMPLETED') {
          toast.success(`${label} : terminé`, { id: t })
          router.refresh()
          return
        }
        if (job.status === 'FAILED' || job.status === 'CANCELLED') {
          toast.error(`${label} : ${job.error ?? job.status}`, { id: t, duration: 10000 })
          router.refresh()
          return
        }
        toast.loading(`${label} — ${job.status === 'PENDING' ? 'en attente du worker' : job.progress_message ?? 'en cours'}…`, { id: t })
      }
    },
    [router],
  )
}
