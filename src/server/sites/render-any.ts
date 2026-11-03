import { isHtmlSite, type WebsiteVersionData } from '@/lib/site/bespoke-schema'
import { getSettings } from '../core/settings'
import { renderSiteDocument } from './html'
import { renderGlassDocument } from './glass/document'
import { renderBespokeDocument } from './bespoke/document'

/** Render any website version (template config or bespoke HTML) to a standalone document. */
export async function renderVersion(v: WebsiteVersionData, mode: 'preview' | 'export' | 'editor', banner: string | null = null): Promise<string> {
  if (isHtmlSite(v)) {
    const s = await getSettings()
    return renderBespokeDocument(v, { mode, banner, disclaimer: s.sites.demoDisclaimer })
  }
  if (v.glass3d) return renderGlassDocument(v, { mode, banner })
  return renderSiteDocument(v, { mode, banner, ...(mode === 'export' ? { cssHref: 'site.css' } : {}) })
}

export const businessNameOf = (v: WebsiteVersionData) => (isHtmlSite(v) ? v.businessName : v.business.name)
