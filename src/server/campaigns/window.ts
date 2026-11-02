/** Pure send-window maths (unit-tested). */
export interface SendWindow {
  timezone: string
  sendDays: number[] // ISO 1=Mon..7=Sun
  startMinute: number
  endMinute: number
}

export function localParts(date: Date, timezone: string): { isoDay: number; minute: number; ymd: string } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  const isoDay = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday as string] ?? 1
  return { isoDay, minute: Number(p.hour) * 60 + Number(p.minute), ymd: `${p.year}-${p.month}-${p.day}` }
}

export function isInWindow(date: Date, w: SendWindow): boolean {
  const { isoDay, minute } = localParts(date, w.timezone)
  return w.sendDays.includes(isoDay) && minute >= w.startMinute && minute < w.endMinute
}

/** Next instant (minute precision, ≤ 8 days ahead) at which sending is allowed. */
export function nextWindowStart(from: Date, w: SendWindow): Date | null {
  const d = new Date(Math.ceil(from.getTime() / 60_000) * 60_000)
  for (let i = 0; i < 8 * 24 * 60; i += 5) {
    const t = new Date(d.getTime() + i * 60_000)
    if (isInWindow(t, w)) return t
  }
  return null
}
