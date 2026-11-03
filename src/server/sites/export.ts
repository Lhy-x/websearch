import { ZipArchive } from 'archiver'
import { PassThrough } from 'node:stream'
import { safeFetch } from '../core/safe-fetch'
import { slugify } from '../core/normalize'
import { SITE_CSS } from '@/lib/site/render/site-css'
import type { SiteConfig } from '@/lib/site/schema'
import { isHtmlSite, type WebsiteVersionData } from '@/lib/site/bespoke-schema'
import { renderBespokeDocument } from './bespoke/document'
import { renderPersonalizedDocument } from './glass/personalized-document'
import { renderGlassDocument } from './glass/document'
import { readFile } from 'node:fs/promises'
import { renderSiteDocument } from './html'

/**
 * Static export: index.html + site.css + site.json (source config, re-importable) + authorised media
 * downloaded locally + README. The demo banner and noindex are removed for delivery to the client.
 */
export async function exportSiteZip(v: WebsiteVersionData, opts: { includeMedia?: boolean; allowPrivate?: boolean } = {}): Promise<{ filename: string; buffer: Buffer; warnings: string[] }> {
  if (isHtmlSite(v)) return zip(slugify(v.businessName) || 'site', [
    { name: 'index.html', data: v.glassScene ? await renderPersonalizedDocument(v,{mode:'export'}) : renderBespokeDocument(v, { mode: 'export' }) },
    { name: 'site.json', data: JSON.stringify(v, null, 2) },
    ...(v.glassScene ? await Promise.all(['licenses/Three-MIT.txt','licenses/Space-Grotesk-OFL.txt','PROVENANCE.md'].map(async name => ({name,data:await readFile(`vendor/premium-3d-glass/${name}`,'utf8')}))) : []),
    { name: 'README.txt', data: `Site sur mesure « ${v.businessName} » — fichier unique index.html (CSS intégré${v.glassScene ? ', moteur 3D local inclus avec repli statique' : ', aucun JavaScript'}), prêt pour tout hébergement statique.\nVérifiez les prestations et les textes avec le client avant publication.\n` },
  ], [])
  if (v.glass3d) {
    const files = [
      { name: 'index.html', data: await renderGlassDocument(v, { mode: 'export' }) },
      { name: 'site.json', data: JSON.stringify(v, null, 2) },
      { name: 'README.txt', data: 'Site 3D Glass autonome : ouvrez index.html ou hébergez-le sur un serveur statique. WebGL 2 requis pour la 3D. Une version lisible reste disponible sans JavaScript et en mode mouvement réduit. Les liens de contact ouvrent le téléphone ou la messagerie ; aucun formulaire serveur. Les médias ajoutés restent des liens distants. Vérifiez les textes et les prestations avant publication. Voir PROVENANCE.md et les licences jointes.\n' },
    ]
    for (const name of ['licenses/Three-MIT.txt', 'licenses/Space-Grotesk-OFL.txt', 'PROVENANCE.md', 'SOURCES.md']) files.push({ name, data: await readFile(`vendor/premium-3d-glass/${name}`, 'utf8') })
    return zip(slugify(v.business.name) || 'site-3d', files, [])
  }
  const cfg: SiteConfig = v
  const warnings: string[] = []
  const files: { name: string; data: Buffer | string }[] = []
  const exported: SiteConfig = structuredClone(cfg)
  if (opts.includeMedia !== false) {
    for (const m of exported.media) {
      try {
        const r = await safeFetch(m.url, { allowPrivate: opts.allowPrivate, maxBytes: 8_000_000, timeoutMs: 20_000, headers: { accept: 'image/*' } })
        const type = r.headers['content-type'] ?? ''
        if (r.status >= 400 || !type.startsWith('image/')) throw new Error(`HTTP ${r.status} ${type}`)
        const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('svg') ? 'svg' : 'jpg'
        const name = `assets/${slugify(m.id) || 'media'}.${ext}`
        files.push({ name, data: r.bodyBuffer })
        m.url = `https://local.invalid/${name}` // placeholder replaced below
      } catch (e) {
        warnings.push(`Média ${m.id} non téléchargé (${(e as Error).message}) : lien distant conservé`)
      }
    }
  }
  let html = renderSiteDocument(exported, { mode: 'export', banner: null, cssHref: 'site.css' })
  html = html.replaceAll('https://local.invalid/', '')
  files.push({ name: 'index.html', data: html })
  files.push({ name: 'site.css', data: SITE_CSS })
  files.push({ name: 'site.json', data: JSON.stringify(cfg, null, 2) })
  files.push({
    name: 'README.txt',
    data: `Site statique « ${cfg.business.name} »\n\n- index.html et site.css : site prêt à héberger (tout hébergement statique : o2switch, OVH, Netlify, GitHub Pages…).\n- site.json : configuration source, ré-importable dans ProspectForge.\n- assets/ : médias dont la licence a été renseignée.\n\nAvant publication : vérifier les prestations indiquées comme « indicatives », les horaires, et retirer/adapter la mention de démonstration dans le pied de page si le client a validé le site.\n`,
  })
  return zip(slugify(cfg.business.name) || 'site', files, warnings)
}

async function zip(name: string, files: { name: string; data: Buffer | string }[], warnings: string[]) {
  const archive = new ZipArchive({ zlib: { level: 9 } })
  const sink = new PassThrough()
  const chunks: Buffer[] = []
  sink.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((resolve, reject) => {
    sink.on('end', resolve)
    archive.on('error', reject)
  })
  archive.pipe(sink)
  for (const f of files) archive.append(f.data, { name: f.name })
  await archive.finalize()
  await done
  return { filename: `${name}.zip`, buffer: Buffer.concat(chunks), warnings }
}
