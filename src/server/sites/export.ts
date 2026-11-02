import { ZipArchive } from 'archiver'
import { PassThrough } from 'node:stream'
import { safeFetch } from '../core/safe-fetch'
import { slugify } from '../core/normalize'
import { SITE_CSS } from '@/lib/site/render/site-css'
import type { SiteConfig } from '@/lib/site/schema'
import { renderSiteDocument } from './html'

/**
 * Static export: index.html + site.css + site.json (source config, re-importable) + authorised media
 * downloaded locally + README. The demo banner and noindex are removed for delivery to the client.
 */
export async function exportSiteZip(cfg: SiteConfig, opts: { includeMedia?: boolean; allowPrivate?: boolean } = {}): Promise<{ filename: string; buffer: Buffer; warnings: string[] }> {
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
  return { filename: `${slugify(cfg.business.name) || 'site'}.zip`, buffer: Buffer.concat(chunks), warnings }
}
