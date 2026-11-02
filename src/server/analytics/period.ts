export interface Period {
  key: 'today' | '7d' | '30d' | '90d' | 'custom'
  from: Date
  to: Date
  label: string
}

export function parsePeriod(sp: Record<string, string | string[] | undefined>): Period {
  const key = (typeof sp.period === 'string' ? sp.period : '30d') as Period['key']
  const to = new Date()
  const startOfToday = new Date(to)
  startOfToday.setHours(0, 0, 0, 0)
  if (key === 'custom' && typeof sp.from === 'string' && typeof sp.to === 'string') {
    const f = new Date(sp.from)
    const t = new Date(sp.to)
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime())) {
      t.setHours(23, 59, 59, 999)
      return { key, from: f, to: t, label: `du ${sp.from} au ${sp.to}` }
    }
  }
  if (key === 'today') return { key, from: startOfToday, to, label: 'aujourd’hui' }
  const days = key === '7d' ? 7 : key === '90d' ? 90 : 30
  return { key: key === '7d' || key === '90d' ? key : '30d', from: new Date(startOfToday.getTime() - (days - 1) * 86400_000), to, label: `${days} derniers jours` }
}
