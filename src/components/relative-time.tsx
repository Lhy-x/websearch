'use client'
import { useEffect, useState } from 'react'
import { fmtDate, fmtRelative } from '@/lib/utils'

/** Keep the first server/client render identical; relative time starts after hydration. */
export function RelativeTime({ date }: { date: string | null }) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    const update = () => setLabel(fmtRelative(date))
    update()
    const interval = setInterval(update, 30000)
    return () => clearInterval(interval)
  }, [date])
  return <time dateTime={date ?? undefined} title={fmtDate(date)}>{label ?? fmtDate(date)}</time>
}
