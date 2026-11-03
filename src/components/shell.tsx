'use client'
import { CreditCard, BarChart3, Bot, MessageSquareText, Building2, Globe, Inbox, KanbanSquare, LayoutDashboard, LogOut, Megaphone, Moon, Search, Settings, ShieldAlert, Sparkles, Sun, Target, Wand2, Pause } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Accueil', icon: LayoutDashboard },
  { href: '/search', label: 'Recherche de prospects', icon: Search },
  { href: '/prospects', label: 'Prospects', icon: Building2 },
  { href: '/qualification', label: 'Qualification', icon: Target },
  { href: '/generator', label: 'Générateur de sites', icon: Wand2 },
  { href: '/sales', label: 'Ventes', icon: CreditCard },
  { href: '/sites', label: 'Démos', icon: Globe },
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
  const [advanced,setAdvanced]=useState(false)
  const primary=['/','/prospects','/sites','/sales','/settings']
  const visibleNav=[...primary.map(href=>NAV.find(n=>n.href===href)!),...NAV.filter(n=>!primary.includes(n.href)&&(advanced||n.href===path))]
  const [q, setQ] = useState('')
  useEffect(() => setMounted(true), [])
  return (
    <div className="app-shell flex min-h-screen">
      <aside className="app-sidebar sticky top-0 hidden h-screen w-64 shrink-0 flex-col lg:flex">
        <div className="app-brand flex h-24 items-center gap-3 px-6">
          <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-fg shadow-lg shadow-primary/20"><Sparkles className="size-4" /></div>
          <span><span className="block text-[15px] font-semibold tracking-tight">ProspectForge</span><span className="mt-0.5 block text-[9px] font-semibold tracking-[.24em] text-muted">L’ATELIER INDÉPENDANT</span></span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-5" aria-label="Navigation principale">
          {visibleNav.map((n) => {
            const active = n.href === '/' ? path === '/' : path.startsWith(n.href)
            return (
              <Link key={n.href} href={n.href} className={cn('app-nav-link mb-1 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] text-muted transition-colors hover:bg-panel-2 hover:text-fg', active && 'is-active')}>
                <n.icon className="size-4" />
                <span className="flex-1">{n.label}</span>
                {n.href === '/inbox' && unread > 0 ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-fg">{unread}</span> : null}
              </Link>
            )
          })}
          <button className="w-full px-3 py-3 text-left text-xs text-muted" onClick={()=>setAdvanced(!advanced)}>{advanced?'Moins d’options':'Options avancées'}</button>
        </nav>
        <div className="mx-4 mb-4 rounded-2xl border border-border p-2"><p className="px-3 py-3 text-[10px] font-medium tracking-[.16em] text-muted">VOTRE ESPACE PRIVÉ</p>
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
        <header className="app-topbar sticky top-0 z-30 flex h-20 items-center gap-4 px-4 backdrop-blur-xl lg:px-9">
          <div className="hidden shrink-0 text-xs text-muted xl:block">Atelier <span className="mx-3 text-border">/</span><span className="font-medium text-fg">{NAV.find(n=>n.href==='/'?path==='/':path.startsWith(n.href))?.label??'Projet'}</span></div>
          <form
            className="relative ml-auto max-w-sm flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (q.trim()) router.push(`/prospects?q=${encodeURIComponent(q.trim())}`)
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un prospect, une ville, un email…" aria-label="Recherche globale" className="h-9 w-full rounded-lg border border-border bg-panel-2 pl-8 pr-3 text-sm placeholder:text-muted" />
          </form>
          <div className="flex items-center gap-2">
            {flags.emergencyStop ? <Link href="/automations" className="flex items-center gap-1.5 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs font-medium text-danger"><ShieldAlert className="size-3.5" />Arrêt d’urgence des envois</Link> : null}
            {flags.globalPause ? <Link href="/automations" className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning"><Pause className="size-3.5" />Automatisations en pause</Link> : null}
            <button aria-label="Changer de thème" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-panel-2" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
              {mounted && resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-panel px-2 py-1.5 lg:hidden" aria-label="Navigation mobile">
          {visibleNav.map((n) => (
            <Link key={n.href} href={n.href} className={cn('min-h-11 inline-flex items-center whitespace-nowrap rounded-lg px-3 py-2 text-xs text-muted', (n.href === '/' ? path === '/' : path.startsWith(n.href)) && 'bg-panel-2 text-fg')}>{n.label}</Link>
          ))}
          <button className="min-h-11 shrink-0 px-3 text-xs text-muted" onClick={()=>setAdvanced(!advanced)}>{advanced?'Moins':'Plus'}</button>
        </nav>
        <main className="mx-auto w-full max-w-[1540px] flex-1 px-4 py-7 lg:px-9 lg:py-9">{children}</main>
      </div>
    </div>
  )
}
