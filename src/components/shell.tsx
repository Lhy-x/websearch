'use client'
import { ArrowUpRight, BarChart3, Bot, Building2, ChevronDown, CircleHelp, CreditCard, Globe2, Inbox, KanbanSquare, Layers2, LayoutGrid, LogOut, Megaphone, Menu, MessageSquareText, Moon, Search, Settings2, ShieldAlert, Sparkles, Sun, Target, Wand2, X, Pause } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { WorkflowSteps } from './workflow'

const PRIMARY = [
  { href: '/', label: 'Vue d’ensemble', icon: LayoutGrid },
  { href: '/prospects', label: 'Mes prospects', icon: Building2 },
  { href: '/sites', label: 'Mes démos', icon: Globe2 },
  { href: '/sales', label: 'Mes ventes', icon: CreditCard },
  { href: '/settings', label: 'Paramètres', icon: Settings2 },
]
const TOOLS = [
  { href: '/search', label: 'Trouver des prospects', icon: Search },
  { href: '/generator', label: 'Créer un site', icon: Wand2 },
  { href: '/qualification', label: 'Qualification', icon: Target },
  { href: '/campaigns', label: 'Campagnes email', icon: Megaphone },
  { href: '/inbox', label: 'Boîte de réception', icon: Inbox },
  { href: '/crm', label: 'Suivi commercial', icon: KanbanSquare },
  { href: '/automations', label: 'Automatisations', icon: Bot },
  { href: '/analytics', label: 'Statistiques', icon: BarChart3 },
  { href: '/assistant', label: 'Assistant', icon: MessageSquareText },
]

export function Shell({ children, flags, unread }: { children: React.ReactNode; flags: { globalPause: boolean; emergencyStop: boolean }; unread: number }) {
  const path = usePathname()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [q, setQ] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const mobileTrigger = useRef<HTMLButtonElement>(null)
  const mobilePanel = useRef<HTMLElement>(null)
  const stage = path.startsWith('/search') || path.startsWith('/prospects') ? 1 : path.startsWith('/generator') ? 2 : path.startsWith('/sites') ? 3 : path.startsWith('/sales') ? 4 : undefined
  const current = [...TOOLS, ...PRIMARY].find(n => n.href === '/' ? path === '/' : path.startsWith(n.href))
  useEffect(() => {
    setMounted(true)
    const shortcut = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.current?.focus() } }
    const desktop = window.matchMedia('(min-width:1024px)')
    const resized = () => { if (desktop.matches) setMobile(false) }
    desktop.addEventListener('change', resized)
    window.addEventListener('keydown', shortcut)
    return () => { desktop.removeEventListener('change', resized); window.removeEventListener('keydown', shortcut) }
  }, [])
  useEffect(() => { setMobile(false) }, [path])
  useEffect(() => {
    if (!mobile) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    mobilePanel.current?.querySelector<HTMLElement>('a,button')?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMobile(false); mobileTrigger.current?.focus() }
      if (e.key === 'Tab') {
        const items = mobilePanel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')
        if (!items?.length) return
        const first = items[0]!, last = items[items.length - 1]!
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', key)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', key); mobileTrigger.current?.focus() }
  }, [mobile])
  const isActive = (href: string) => href === '/' ? path === '/' : path.startsWith(href) || (href === '/prospects' && path === '/search') || (href === '/sites' && path === '/generator')
  const sidebar = (isMobile = false) => <>
    <Link href="/" className="app-brand"><span className="brand-symbol"><Layers2 size={22}/></span><span>Prospect<span className="font-normal">Forge</span><small>Votre atelier commercial</small></span></Link>
    <div className="nav-section-label">MON ESPACE</div>
    <nav aria-label={isMobile ? 'Navigation mobile' : 'Navigation principale'} className="space-y-1">
      {PRIMARY.map(n => <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined} className={cn('app-nav-link', isActive(n.href) && 'is-active')}><n.icon size={19}/><span>{n.label}</span>{isActive(n.href) ? <span className="nav-active-dot"/> : null}</Link>)}
    </nav>
    <button className="advanced-toggle" aria-expanded={advanced} aria-controls={isMobile ? 'mobile-tools' : 'desktop-tools'} onClick={() => setAdvanced(!advanced)}><span>Outils avancés</span><ChevronDown size={15} className={cn('transition-transform', advanced && 'rotate-180')}/></button>
    <nav id={isMobile ? 'mobile-tools' : 'desktop-tools'} aria-label="Outils avancés" hidden={!advanced} className="space-y-1">
      {TOOLS.map(n => <Link key={n.href} href={n.href} className={cn('app-nav-link', path.startsWith(n.href) && 'is-active')}><n.icon size={17}/><span>{n.label}</span>{n.href === '/inbox' && unread > 0 ? <span className="nav-count">{unread}</span> : null}</Link>)}
    </nav>
    <div className="sidebar-bottom"><Link href="/guide" className="sidebar-guide"><span className="mb-3 inline-flex rounded-full bg-white/15 p-2"><Sparkles size={17}/></span><strong>Un premier site, étape par étape.</strong><span>Du prospect à votre première vente.</span><span className="guide-cta">Suivre le guide <ArrowUpRight size={16}/></span></Link>
      <div className="sidebar-utilities"><Link href="/guide"><CircleHelp size={17}/>Aide & prise en main</Link><button onClick={async () => { const response = await fetch('/api/auth/logout', { method: 'POST' }); if (response.ok) router.push('/login') }}><LogOut size={17}/>Déconnexion</button></div>
    </div>
  </>
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Aller au contenu</a>
    <aside className="app-sidebar desktop-sidebar">{sidebar()}</aside>
    {mobile ? <div className="mobile-navigation"><button className="mobile-backdrop" aria-label="Fermer le menu" onClick={() => { setMobile(false); mobileTrigger.current?.focus() }}/><aside ref={mobilePanel} className="app-sidebar mobile-sidebar" role="dialog" aria-modal="true" aria-label="Menu de navigation"><button className="mobile-close" aria-label="Fermer le menu" onClick={() => { setMobile(false); mobileTrigger.current?.focus() }}><X size={20}/></button>{sidebar(true)}</aside></div> : null}
    <div className="app-content" inert={mobile || undefined}>
      <header className="app-topbar">
        <button ref={mobileTrigger} className="header-icon mobile-menu-trigger" aria-label="Ouvrir le menu" aria-expanded={mobile} onClick={() => setMobile(true)}><Menu size={21}/></button>
        <div className="header-breadcrumb"><span>Mon espace</span><span className="text-border">/</span><strong>{path === '/guide' ? 'Prise en main' : current?.label ?? 'Mon projet'}</strong></div>
        <form role="search" className="global-search" onSubmit={e => { e.preventDefault(); if (q.trim()) router.push(`/prospects?q=${encodeURIComponent(q.trim())}`) }}><Search size={18}/><input ref={search} value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un prospect…" aria-label="Recherche globale"/><kbd>⌘ K</kbd></form>
        <div className="header-actions"><Link href="/inbox" className="header-icon inbox-shortcut" aria-label={unread ? `Boîte de réception, ${unread} non lus` : 'Boîte de réception'}><Inbox size={19}/>{unread ? <span className="unread-dot"/> : null}</Link><button className="header-icon" aria-label="Changer de thème" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>{mounted && resolvedTheme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button><Link href="/settings" className="account-avatar" aria-label="Ouvrir les paramètres">PF</Link></div>
      </header>
      {flags.emergencyStop || flags.globalPause ? <div className={cn('system-banner', flags.emergencyStop && 'text-danger')}><span>{flags.emergencyStop ? <ShieldAlert size={16}/> : <Pause size={16}/>}</span><p>{flags.emergencyStop ? 'Les envois sont arrêtés.' : 'Les automatisations sont en pause.'}</p><Link href="/automations">Gérer <ArrowUpRight size={14}/></Link></div> : null}
      <main id="main-content" tabIndex={-1} className="app-main">{stage ? <WorkflowSteps current={stage}/> : null}{children}</main>
      <footer className="app-footer"><span>ProspectForge · Votre prochain projet commence ici.</span><Link href="/guide">Besoin d’un coup de main ? <ArrowUpRight size={13}/></Link></footer>
    </div>
  </div>
}
