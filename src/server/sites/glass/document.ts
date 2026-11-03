import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parse } from 'node-html-parser'
import type { SiteConfig } from '@/lib/site/schema'
import { renderSiteDocument, type DocumentOptions } from '../html'
import { SITE_CSS } from '@/lib/site/render/site-css'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const literal = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c')
const root = path.join(process.cwd(), 'vendor/premium-3d-glass')
const cache = new Map<string, Promise<string>>()
function asset(name: string) {
  if (!cache.has(name)) cache.set(name, readFile(path.join(root, name), 'utf8'))
  return cache.get(name)!
}
async function data(name: string, mime: string) {
  return `data:${mime};base64,${(await readFile(path.join(root, name))).toString('base64')}`
}
let shared: Promise<{ template: string; css: string; app: string; imports: string; mark: string }> | undefined
function assets() {
  return shared ??= (async () => {
    const [template, style, fonts, app, three, loader, mark] = await Promise.all([
      asset('index.html'), asset('css/styles.css'), asset('css/fonts.css'), asset('js/app.js'),
      data('vendor/three.module.js', 'text/javascript'), data('vendor/SVGLoader.js', 'text/javascript'), asset('assets/brand/mark.svg'),
    ])
    let embeddedFonts = fonts
    for (const m of fonts.matchAll(/url\(\.\.\/assets\/fonts\/([^)]+)\)/g)) {
      embeddedFonts = embeddedFonts.replace(m[0], `url(${await data(`assets/fonts/${m[1]}`, 'font/ttf')})`)
    }
    return { template, css: embeddedFonts + style.replace(/@import[^;]+;/g, ''), app,
      imports: literal({ imports: { three, 'three/examples/jsm/loaders/SVGLoader.js': loader } }), mark }
  })()
}

/** Only trusted, bundled code runs. Business data is escaped HTML or validated colours/shapes. */
export async function renderGlassDocument(cfg: SiteConfig, opts: DocumentOptions): Promise<string> {
  const a = await assets()
  const shape = cfg.glass3d?.shape ?? 'spark'
  const svg = await asset(`assets/library/${shape}.svg`)
  const about = cfg.sections.find(s => s.enabled && s.type === 'about')
  const services = cfg.sections.find(s => s.enabled && s.type === 'services')
  const b = cfg.business
  const title = cfg.hero.title.split(/\s+/)
  const middle = Math.ceil(title.length / 2)
  const tokens: Record<string, string> = {
    LANG: cfg.language, TITLE: cfg.seo.title, META_DESCRIPTION: cfg.seo.description, BRAND: b.name,
    NAV_LABEL: 'Navigation principale', NAV_1: 'Accueil', NAV_2: 'Présentation', NAV_3: 'Prestations', NAV_4: 'Informations', NAV_CONTACT: 'Contact',
    T1_A: title.slice(0, middle).join(' '), T1_B: title.slice(middle).join(' '), LEAD_1: cfg.hero.subtitle,
    T2_A: 'À votre', T2_B: 'rencontre.', ABOUT: about?.type === 'about' ? about.body : [b.sectorLabel, b.city].filter(Boolean).join(' · '),
    T3_A: 'Nos', T3_B: 'prestations.', T4_A: 'Informations', T4_B: 'pratiques.',
    RESULTS_LEAD: [b.address, b.postcode, b.city].filter(Boolean).join(' '),
    CT_A: 'Parlons de', CT_B: 'votre projet.', CONTACT_LEAD: 'Retrouvez les coordonnées et toutes les informations ci-dessous.',
    YEAR: String(new Date().getFullYear()), FOOTER_SPEC: cfg.disclaimer, FOOTER_TOP: 'Haut de page', EMAIL: b.email ?? '',
  }
  const doc = parse(a.template, { blockTextElements: { script: true, style: true } })
  doc.querySelectorAll('script').forEach(n => n.remove())
  doc.querySelectorAll('link').forEach(n => n.remove())
  doc.querySelector('#loader')?.remove()
  doc.querySelector('.figures')?.remove() // No invented performance figures from the supplied example.
  doc.querySelector('#contact-form')?.remove()
  doc.querySelector('.contact-mail')?.remove()
  doc.querySelector('.benefits')?.set_content(services?.type === 'services'
    ? services.items.slice(0, 4).map(s => `<li class="benefit"><p>${esc(s.title)}${s.description ? ` — ${esc(s.description)}` : ''}</p></li>`).join('') + `<li class="benefit"><p>${esc(services.note || (services.items.some(s => s.indicative) ? 'Prestations indicatives — à confirmer avec l’établissement.' : ''))}</p></li>`
    : '<li class="benefit"><p>Prestations à confirmer auprès de l’établissement.</p></li>')
  const contactLinks = [b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : '', b.phoneE164 ? `<a href="tel:${esc(b.phoneE164.replace(/[^+\d]/g, ''))}">${esc(b.phone ?? b.phoneE164)}</a>` : ''].filter(Boolean).join('<br>')
  doc.querySelector('.contact-inner')?.insertAdjacentHTML('beforeend', `<div class="contact-card pf-glass-contact">${contactLinks || '<p>Coordonnées à compléter avec l’établissement.</p>'}</div>`)
  doc.querySelector('#slide-1 .slide-title')!.tagName = 'h1'
  let html = doc.toString().replace(/{{(\w+)}}/g, (_m, key: string) => esc(tokens[key] ?? ''))
  html = html.replace('<span class="brand-mark" aria-hidden="true"></span>', `<span class="brand-mark" aria-hidden="true">${a.mark}</span>`)
  // Preserve every editable section in a readable, no-JS version. Prefix IDs to avoid scene collisions.
  const readable = parse(renderSiteDocument(cfg, { ...opts, cssHref: undefined, banner: null }))
  const content = readable.querySelector('body')!
  for (const el of content.querySelectorAll('[id]')) el.setAttribute('id', `readable-${el.id}`)
  for (const el of content.querySelectorAll('a[href^="#"]')) el.setAttribute('href', `#readable-${el.getAttribute('href')!.slice(1)}`)
  const banner = opts.banner ? `<div class="pf-glass-banner" role="note">${esc(opts.banner)}</div>` : ''
  const bodyStart = html.indexOf('<body>')
  const bodyEnd = html.lastIndexOf('</body>')
  html = html.slice(0, bodyStart) + `<body>${banner}<div class="glass-story">${html.slice(bodyStart + 6, bodyEnd)}</div><details class="glass-readable" open><summary>Toutes les informations · version sans animation</summary>${content.innerHTML}</details></body></html>`
  let app = a.app.replace(/^import .*;\s*$/gm, '')
    .replace(/const shapeSources = await Promise\.all\([\s\S]*?\}\)\);/, `const shapeSources = ${literal([svg])};`)
    .replace(/palette: \[[^\]]*\]/, `palette: ${literal([cfg.theme.primary, cfg.theme.accent, '#403d88', cfg.theme.primary, '#151727'])}`)
    .replace('function animate(now = performance.now()) {', 'function animate(now = performance.now()) {\n    if (!document.body.classList.contains("glass-ready")) return;')
  // Imported modules have no network dependency. Reduced motion, no JS or failed WebGL show readable HTML.
  app = `import * as THREE from 'three';\nimport { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';\nconst motion = matchMedia('(prefers-reduced-motion: reduce)');\nif (!motion.matches) {\ntry {\ndocument.body.classList.add('glass-ready');\n${app}\ndocument.querySelector('.glass-readable').open = false;\nconst fallback = () => { document.body.classList.remove('glass-ready', 'is-loading'); document.querySelector('.glass-readable').open = true; };\nmotion.addEventListener('change', e => { if(e.matches) fallback(); });\ndocument.querySelector('#webgl').addEventListener('webglcontextlost', fallback);\n} catch(error) { document.body.classList.remove('glass-ready', 'is-loading'); document.querySelector('.glass-readable').open = true; console.warn('Rendu 3D indisponible, version lisible activée.'); }\n}\ndocument.documentElement.dataset.glassState = document.body.classList.contains('glass-ready') ? 'ready' : 'static';`
  // CSP is applied inside srcdoc and exports as well as on the public response.
  const scripts = `<script type="importmap">${a.imports}</script><script type="module">${app}</script>`
  const csp = glassCsp(scripts).replace("; frame-ancestors 'self'", '')
  return html.replace('</head>', `<meta name="robots" content="${opts.mode === 'export' ? 'index,follow' : 'noindex,nofollow,noarchive'}"><meta http-equiv="Content-Security-Policy" content="${esc(csp)}"><style>${SITE_CSS}\n${a.css}\n${OVERRIDES}</style></head>`).replace('</body>', `${scripts}</body>`)
}

/** Hash each trusted inline script; never allow arbitrary inline or same-origin application scripts. */
export function glassCsp(html: string): string {
  const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`)
  return ["default-src 'none'", `script-src data: ${hashes.join(' ')}`, "style-src 'unsafe-inline'", 'font-src data:', 'img-src data: https:', 'frame-src https://www.openstreetmap.org', "connect-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'self'"].join('; ')
}

const OVERRIDES = `
html{scroll-behavior:auto}body{overflow-x:hidden}*{user-select:auto}
.glass-story{display:none}.glass-ready .glass-story{display:block}
.glass-readable{position:relative;z-index:10;background:#0b0d18;color:white;padding:24px;cursor:auto}
.glass-readable summary{padding:16px;min-height:48px;cursor:pointer!important;font:16px system-ui}
body:not(.glass-ready) .glass-readable{padding:0}body:not(.glass-ready) .glass-readable summary{display:none}
.pf-glass-banner{position:relative;z-index:100;background:#111;color:#fff;padding:10px 16px;font:13px/1.5 system-ui;text-align:center}
body:has(.pf-glass-banner) .main-header{top:54px}
.pf-glass-contact{font-size:clamp(16px,2vw,24px);overflow-wrap:anywhere}
.pf-glass-contact a{display:inline-block;min-height:44px;padding:12px;color:inherit;pointer-events:auto}
.benefits{max-height:44vh;overflow:auto}.benefit p{font-size:clamp(14px,1.2vw,18px)}
.glass-readable *{cursor:auto!important}.glass-readable a,.glass-readable summary{cursor:pointer!important}
a:focus-visible,summary:focus-visible{outline:3px solid #fff;outline-offset:4px}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`
