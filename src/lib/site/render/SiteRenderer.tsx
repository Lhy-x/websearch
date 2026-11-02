import type { CSSProperties, ReactNode } from 'react'
import type { Section, SiteConfig } from '../schema'
import { Icon } from './icons'

type S<T extends Section['type']> = Extract<Section, { type: T }>

export interface RenderOptions {
  mode: 'preview' | 'export' | 'editor'
  banner?: string | null
}

const RADIUS = { none: '0px', sm: '4px', md: '10px', lg: '18px', full: '999px' } as const
const DENSITY = { compact: '56px', comfortable: '88px', airy: '120px' } as const

export function themeVars(c: SiteConfig): CSSProperties {
  const t = c.theme
  return {
    ['--c-primary' as string]: t.primary,
    ['--c-accent' as string]: t.accent,
    ['--c-bg' as string]: t.background,
    ['--c-surface' as string]: t.surface,
    ['--c-text' as string]: t.text,
    ['--c-muted' as string]: t.muted,
    ['--f-head' as string]: `'${t.headingFont}', Georgia, serif`,
    ['--f-body' as string]: `'${t.bodyFont}', system-ui, sans-serif`,
    ['--radius' as string]: RADIUS[t.radius],
    ['--section-pad' as string]: DENSITY[t.density],
    ['--head-case' as string]: t.headingCase === 'uppercase' ? 'uppercase' : 'none',
  }
}

function Btn({ href, label, variant, cfg }: { href: string; label: string; variant: 'primary' | 'ghost'; cfg: SiteConfig }) {
  const ext = href.startsWith('http')
  return (
    <a className={`pf-btn pf-btn--${variant} pf-btn--${cfg.theme.buttonStyle}`} href={href} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {label}
    </a>
  )
}

function SectionShell({ s, children, className = '' }: { s: Section; children: ReactNode; className?: string }) {
  return (
    <section id={s.id} className={`pf-section pf-section--${s.type} ${className}`}>
      <div className="pf-container">
        {s.title ? <h2 className="pf-h2">{s.title}</h2> : null}
        {s.intro ? <p className="pf-intro">{s.intro}</p> : null}
        {children}
      </div>
    </section>
  )
}

function About({ s }: { s: S<'about'> }) {
  return (
    <SectionShell s={s}>
      <div className="pf-about">
        <div className="pf-about__deco" aria-hidden="true" />
        <p className="pf-lead">{s.body}</p>
      </div>
    </SectionShell>
  )
}

function Services({ s, cfg }: { s: S<'services'>; cfg: SiteConfig }) {
  const numbered = cfg.layout === 'studio' || cfg.layout === 'barber'
  return (
    <SectionShell s={s}>
      <ol className={`pf-services pf-services--${cfg.layout}`}>
        {s.items.map((it, i) => (
          <li key={i} className="pf-service">
            <span className="pf-service__icon">{numbered ? <span className="pf-num">{String(i + 1).padStart(2, '0')}</span> : <Icon name={it.icon} />}</span>
            <span className="pf-service__body">
              <strong className="pf-service__title">{it.title}</strong>
              {it.description ? <span className="pf-service__desc">{it.description}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}

function Benefits({ s }: { s: S<'benefits'> }) {
  return (
    <SectionShell s={s}>
      <div className="pf-grid3">
        {s.items.map((it, i) => (
          <div key={i} className="pf-card">
            <span className="pf-card__icon"><Icon name={it.icon} /></span>
            <h3 className="pf-h3">{it.title}</h3>
            <p className="pf-muted">{it.description}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

function Process({ s }: { s: S<'process'> }) {
  return (
    <SectionShell s={s}>
      <ol className="pf-steps">
        {s.items.map((it, i) => (
          <li key={i} className="pf-step">
            <span className="pf-step__n">{i + 1}</span>
            <h3 className="pf-h3">{it.title}</h3>
            <p className="pf-muted">{it.description}</p>
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}

function Gallery({ s, cfg }: { s: S<'gallery'>; cfg: SiteConfig }) {
  const media = s.mediaIds.map((id) => cfg.media.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m)
  if (!media.length) return null
  return (
    <SectionShell s={s}>
      <div className="pf-gallery">
        {media.map((m) => (
          <figure key={m.id} className="pf-gallery__item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.alt} loading="lazy" />
            <figcaption className="pf-credit">{m.license}{m.source ? ` — ${m.source}` : ''}</figcaption>
          </figure>
        ))}
      </div>
    </SectionShell>
  )
}

function Hours({ s }: { s: S<'hours'> }) {
  if (!s.lines.length) return null
  return (
    <SectionShell s={s}>
      <div className="pf-hours">
        <Icon name="clock" size={28} />
        <ul>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <p className="pf-credit">Source : {s.source}</p>
      </div>
    </SectionShell>
  )
}

function Area({ s }: { s: S<'area'> }) {
  return (
    <SectionShell s={s}>
      <p className="pf-lead">{s.body}</p>
      {s.places.length ? <ul className="pf-tags">{s.places.map((p, i) => <li key={i}>{p}</li>)}</ul> : null}
    </SectionShell>
  )
}

function Faq({ s }: { s: S<'faq'> }) {
  return (
    <SectionShell s={s}>
      <div className="pf-faq">
        {s.items.map((it, i) => (
          <details key={i} className="pf-faq__item">
            <summary>{it.q}</summary>
            <p>{it.a}</p>
          </details>
        ))}
      </div>
    </SectionShell>
  )
}

function Cta({ s, cfg }: { s: S<'cta'>; cfg: SiteConfig }) {
  return (
    <section id={s.id} className="pf-section pf-section--cta">
      <div className="pf-container pf-cta">
        <div>
          <h2 className="pf-h2">{s.title}</h2>
          <p>{s.body}</p>
        </div>
        <Btn href={s.cta.href} label={s.cta.label} variant="primary" cfg={cfg} />
      </div>
    </section>
  )
}

function Contact({ s, cfg }: { s: S<'contact'>; cfg: SiteConfig }) {
  const b = cfg.business
  const hasGeo = b.lat != null && b.lon != null
  const d = 0.006
  const mapSrc = hasGeo ? `https://www.openstreetmap.org/export/embed.html?bbox=${b.lon! - d},${b.lat! - d / 1.6},${b.lon! + d},${b.lat! + d / 1.6}&layer=mapnik&marker=${b.lat},${b.lon}` : null
  return (
    <SectionShell s={s}>
      <div className="pf-contact">
        <ul className="pf-contact__list">
          {b.address || b.city ? (
            <li><Icon name="map" /><span>{[b.address, [b.postcode, b.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span></li>
          ) : null}
          {b.phone && b.phoneE164 ? <li><Icon name="phone" /><a href={`tel:${b.phoneE164}`}>{b.phone}</a></li> : null}
          {b.email ? <li><Icon name="mail" /><a href={`mailto:${b.email}`}>{b.email}</a></li> : null}
          {b.socials.map((so) => (
            <li key={so.url}><Icon name="users" /><a href={so.url} target="_blank" rel="noopener noreferrer">{so.network}</a></li>
          ))}
        </ul>
        {mapSrc ? <iframe className="pf-map" title={`Plan d’accès – ${b.name}`} src={mapSrc} loading="lazy" /> : null}
      </div>
    </SectionShell>
  )
}

function renderSection(s: Section, cfg: SiteConfig) {
  if (!s.enabled) return null
  switch (s.type) {
    case 'about': return <About key={s.id} s={s} />
    case 'services': return <Services key={s.id} s={s} cfg={cfg} />
    case 'benefits': return <Benefits key={s.id} s={s} />
    case 'process': return <Process key={s.id} s={s} />
    case 'gallery': return <Gallery key={s.id} s={s} cfg={cfg} />
    case 'hours': return <Hours key={s.id} s={s} />
    case 'area': return <Area key={s.id} s={s} />
    case 'faq': return <Faq key={s.id} s={s} />
    case 'cta': return <Cta key={s.id} s={s} cfg={cfg} />
    case 'contact': return <Contact key={s.id} s={s} cfg={cfg} />
  }
}

function Hero({ cfg }: { cfg: SiteConfig }) {
  const h = cfg.hero
  const heroMedia = h.mediaId ? cfg.media.find((m) => m.id === h.mediaId) : null
  const services = cfg.sections.find((s): s is S<'services'> => s.type === 'services' && s.enabled)
  const ctas = (
    <div className="pf-hero__ctas">
      {h.primaryCta ? <Btn href={h.primaryCta.href} label={h.primaryCta.label} variant="primary" cfg={cfg} /> : null}
      {h.secondaryCta ? <Btn href={h.secondaryCta.href} label={h.secondaryCta.label} variant="ghost" cfg={cfg} /> : null}
    </div>
  )
  const visual = heroMedia ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="pf-hero__img" src={heroMedia.url} alt={heroMedia.alt} />
  ) : (
    <div className="pf-hero__art" aria-hidden="true"><span /><span /><span /></div>
  )
  switch (cfg.layout) {
    case 'trade':
      return (
        <header className="pf-hero pf-hero--trade">
          <div className="pf-container pf-hero__grid">
            <div>
              <p className="pf-eyebrow">{h.eyebrow}</p>
              <h1 className="pf-h1">{h.title}</h1>
              <p className="pf-hero__sub">{h.subtitle}</p>
              {services ? <ul className="pf-checks">{services.items.slice(0, 4).map((i, k) => <li key={k}><Icon name="check" size={18} />{i.title}</li>)}</ul> : null}
              {ctas}
            </div>
            <aside className="pf-hero__card">
              <p className="pf-hero__card-title">Besoin d’une intervention ?</p>
              {cfg.business.phone && cfg.business.phoneE164 ? (
                <a className="pf-hero__phone" href={`tel:${cfg.business.phoneE164}`}><Icon name="phone" /> {cfg.business.phone}</a>
              ) : null}
              {cfg.business.email ? <a className="pf-hero__mail" href={`mailto:${cfg.business.email}`}>{cfg.business.email}</a> : null}
              {cfg.business.city ? <p className="pf-muted"><Icon name="map" size={16} /> {cfg.business.city} et alentours</p> : null}
            </aside>
          </div>
        </header>
      )
    case 'studio':
      return (
        <header className="pf-hero pf-hero--studio">
          <div className="pf-container">
            <p className="pf-eyebrow">{h.eyebrow}</p>
            <h1 className="pf-h1 pf-h1--xl">{h.title}</h1>
            <div className="pf-hero__row"><p className="pf-hero__sub">{h.subtitle}</p>{ctas}</div>
            {heroMedia ? visual : <div className="pf-rule" aria-hidden="true" />}
          </div>
        </header>
      )
    case 'barber':
    case 'corporate':
      return (
        <header className={`pf-hero pf-hero--${cfg.layout}`}>
          <div className="pf-container pf-hero__grid">
            <div>
              <p className="pf-eyebrow">{h.eyebrow}</p>
              <h1 className="pf-h1">{h.title}</h1>
              <p className="pf-hero__sub">{h.subtitle}</p>
              {ctas}
            </div>
            {visual}
          </div>
        </header>
      )
    case 'table':
    case 'bakery':
    case 'salon':
    default:
      return (
        <header className={`pf-hero pf-hero--${cfg.layout}`}>
          {cfg.layout === 'table' && heroMedia ? <div className="pf-hero__bg">{visual}</div> : null}
          <div className="pf-container pf-hero__center">
            <p className="pf-eyebrow">{h.eyebrow}</p>
            <h1 className="pf-h1">{h.title}</h1>
            <p className="pf-hero__sub">{h.subtitle}</p>
            {ctas}
          </div>
          {cfg.layout === 'salon' ? <div className="pf-hero__art pf-hero__art--soft" aria-hidden="true"><span /><span /></div> : null}
        </header>
      )
  }
}

export function SiteRenderer({ cfg, opts }: { cfg: SiteConfig; opts: RenderOptions }) {
  const b = cfg.business
  return (
    <div className={`pf-site pf-layout--${cfg.layout} pf-style--${cfg.style}`} style={themeVars(cfg)} data-template={cfg.templateId}>
      {opts.banner ? <div className="pf-demo-banner" role="note">{opts.banner}</div> : null}
      {cfg.layout === 'trade' && b.phone && b.phoneE164 ? (
        <div className="pf-topbar"><div className="pf-container"><span>{b.city ?? ''}</span><a href={`tel:${b.phoneE164}`}><Icon name="phone" size={16} /> {b.phone}</a></div></div>
      ) : null}
      <nav className="pf-nav" aria-label="Navigation principale">
        <div className="pf-container pf-nav__inner">
          <a className="pf-brand" href="#top">{b.name}</a>
          <ul className="pf-nav__links">
            {cfg.navigation.map((n) => <li key={n.target}><a href={n.target}>{n.label}</a></li>)}
          </ul>
          {cfg.navigation.length ? (
            <details className="pf-nav__mobile">
              <summary aria-label="Menu">Menu</summary>
              <ul>{cfg.navigation.map((n) => <li key={n.target}><a href={n.target}>{n.label}</a></li>)}</ul>
            </details>
          ) : null}
        </div>
      </nav>
      <main id="top">
        <Hero cfg={cfg} />
        {cfg.sections.map((s) => renderSection(s, cfg))}
      </main>
      <footer className="pf-footer">
        <div className="pf-container">
          <p><strong>{b.name}</strong>{b.city ? ` · ${b.city}` : ''}</p>
          <p className="pf-footer__disclaimer">{cfg.disclaimer}</p>
        </div>
      </footer>
    </div>
  )
}
