'use client'
import { BarChart3, Bot, MessageSquareText, Building2, Globe, Inbox, KanbanSquare, LayoutDashboard, LogOut, Megaphone, Moon, Search, Settings, ShieldAlert, Sparkles, Sun, Target, Wand2, Pause } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/search', label: 'Recherche de prospects', icon: Search },
  { href: '/prospects', label: 'Base de prospects', icon: Building2 },
  { href: '/qualification', label: 'Qualification', icon: Target },
  { href: '/generator', label: 'Générateur de sites', icon: Wand2 },
  { href: '/sites', label: 'Sites générés', icon: Globe },
  { href: '/campaigns', label: 'Campagnes', icon: Megaphone },
  { href: '/inbox', label: 'Boîte de réception', icon: Inbox },
  { href: '/crm', label: 'CRM', icon: KanbanSquare },
  { href: '/automations', label: 'Automatisations', icon: Bot },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/assistant', label: 'Assistant', icon: MessageSquareText },
  { href: '/settings', label: 'Paramètres', icon: Settings },
]

export function Shell({ children, flags, unread }: { children: React.ReactNode; flags: { globalPause: boolean; emergencyStop: boolean }; unread: number }) {
  const path = usePathname()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [q, setQ] = useState('')
  useEffect(() => setMounted(true), [])
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-panel lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-fg"><Sparkles className="size-4" /></div>
          <span className="text-sm font-semibold tracking-tight">ProspectForge</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-2" aria-label="Navigation principale">
          {NAV.map((n) => {
            const active = n.href === '/' ? path === '/' : path.startsWith(n.href)
            return (
              <Link key={n.href} href={n.href} className={cn('mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-panel-2 hover:text-fg', active && 'bg-panel-2 font-medium text-fg')}>
                <n.icon className="size-4" />
                <span className="flex-1">{n.label}</span>
                {n.href === '/inbox' && unread > 0 ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-fg">{unread}</span> : null}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-border p-2">
          <button
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:bg-panel-2 hover:text-fg"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              router.push('/login')
            }}
          >
            <LogOut className="size-4" /> Déconnexion
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-panel/85 px-4 backdrop-blur lg:px-6">
          <form
            className="relative max-w-md flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (q.trim()) router.push(`/prospects?q=${encodeURIComponent(q.trim())}`)
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un prospect, une ville, un email…" aria-label="Recherche globale" className="h-9 w-full rounded-lg border border-border bg-panel-2 pl-8 pr-3 text-sm placeholder:text-muted" />
          </form>
          <div className="ml-auto flex items-center gap-2">
            {flags.emergencyStop ? <Link href="/automations" className="flex items-center gap-1.5 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs font-medium text-danger"><ShieldAlert className="size-3.5" />Arrêt d’urgence des envois</Link> : null}
            {flags.globalPause ? <Link href="/automations" className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning"><Pause className="size-3.5" />Automatisations en pause</Link> : null}
            <button aria-label="Changer de thème" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-panel-2" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
              {mounted && resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-panel px-2 py-1.5 lg:hidden" aria-label="Navigation mobile">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn('whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs text-muted', (n.href === '/' ? path === '/' : path.startsWith(n.href)) && 'bg-panel-2 text-fg')}>{n.label}</Link>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
