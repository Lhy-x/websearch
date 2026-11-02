import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('fr-FR').format(n))
export const fmtPct = (num = 0, den = 0) => (den > 0 ? `${((100 * num) / den).toFixed(1).replace('.', ',')} %` : '—')
export const fmtUsd = (n: number | string | null | undefined) => (n == null ? '—' : `${Number(n).toFixed(Number(n) < 1 ? 4 : 2).replace('.', ',')} $`)
export const fmtEur = (cents: number | null | undefined) => (cents == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100))
export function fmtDate(d: string | Date | null | undefined, withTime = true): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('fr-FR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date)
}
export function fmtRelative(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const t = (typeof d === 'string' ? new Date(d) : d).getTime()
  const s = Math.round((t - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
  const abs = Math.abs(s)
  if (abs < 60) return rtf.format(s, 'second')
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  return rtf.format(Math.round(s / 86400), 'day')
}

/** fetch wrapper for our JSON API: throws Error(message) on non-2xx. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { 'content-type': 'application/json' } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: { path: string; message: string }[] }
  if (!res.ok) {
    const detail = data.issues?.length ? ' — ' + data.issues.map((i) => `${i.path}: ${i.message}`).join(' ; ') : ''
    throw new Error((data.error ?? `Erreur ${res.status}`) + detail)
  }
  return data as T
}
