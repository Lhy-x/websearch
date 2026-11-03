import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'node-html-parser'
import type { HtmlSite } from '@/lib/site/bespoke-schema'
import { renderBespokeDocument } from '../bespoke/document'
import { sanitizeSiteHtml } from '../bespoke/sanitize'
import { sanitizeSilhouette } from './silhouette'
import { glassCsp } from './document'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!)
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c')
let cached: Promise<{ imports: string; runtime: string }> | undefined
function runtime() {
  return cached ??= (async () => {
    const root = path.join(process.cwd(),'vendor/premium-3d-glass')
    const [three, loader, original, custom] = await Promise.all(['vendor/three.module.js','vendor/SVGLoader.js','js/app.js','personalized-runtime.js'].map(name=>readFile(path.join(root,name),'utf8')))
    const helpers = original!.slice(original!.indexOf('function createGlassEnvironment()'),original!.indexOf('// ---- 2D contour helpers'))
      + original!.slice(original!.indexOf('function cleanContour('),original!.indexOf('// ---- Morph correspondence'))
      + original!.slice(original!.indexOf('function pointInPolygon('),original!.indexOf('// ---- Building the two glass shapes'))
    return { imports:json({imports:{three:`data:text/javascript;base64,${Buffer.from(three!).toString('base64')}`,'three/examples/jsm/loaders/SVGLoader.js':`data:text/javascript;base64,${Buffer.from(loader!).toString('base64')}`}}),runtime:custom!.replace('/* GLASS_HELPERS */',helpers) }
  })()
}

/** AI creates every page layout. Only the reviewed glass renderer is executable. */
export async function renderPersonalizedDocument(site: HtmlSite, opts: Parameters<typeof renderBespokeDocument>[1]): Promise<string> {
  const plan = site.glassScene
  if (!plan) return renderBespokeDocument(site,opts)
  const silhouette=sanitizeSilhouette(plan.silhouette)
  const clean=sanitizeSiteHtml(site.html,site.media.map(m=>m.url)).html
  const document=parse(renderBespokeDocument({...site,html:clean},opts),{blockTextElements:{script:true,style:true}})
  const hosts=document.querySelectorAll('[data-glass-scene]')
  // A bad manual edit remains readable; the generated pipeline rejects a missing slot.
  if (!hosts.length) return document.toString()
  hosts.slice(1).forEach(host=>host.removeAttribute('data-glass-scene'))
  const host=hosts[0]!
  host.setAttribute('role','img')
  host.setAttribute('aria-label',esc(plan.description))
  host.set_content(`<div data-glass-fallback aria-hidden="true">${silhouette}</div>`)
  const a=await runtime()
  const app=a.runtime.replace('/* SCENE_PLAN */',json({...plan,silhouette}))
  const scripts=`<script type="importmap">${a.imports}</script><script type="module">${app}</script>`
  const csp=glassCsp(scripts).replace("; frame-ancestors 'self'",'')
  document.querySelector('head')?.insertAdjacentHTML('beforeend',`<meta http-equiv="Content-Security-Policy" content="${esc(csp)}"><style>[data-glass-scene]{position:relative!important;isolation:isolate;min-height:280px;overflow:hidden}[data-glass-fallback]{display:grid;place-items:center;min-height:inherit;padding:30px}[data-glass-fallback] svg{width:65%;max-height:400px;fill:${plan.palette[1]}}[data-glass-ready] [data-glass-fallback]{visibility:hidden}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}*,*::before,*::after{animation:none!important;transition:none!important}}</style>`)
  document.querySelector('body')?.insertAdjacentHTML('beforeend',scripts)
  return document.toString()
}
