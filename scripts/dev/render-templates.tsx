import { writeFileSync, mkdirSync } from 'node:fs'
import { buildDeterministicConfig } from '../../src/lib/site/build'
import { TEMPLATES } from '../../src/lib/site/templates'
import { renderSiteDocument } from '../../src/server/sites/html'

const out = process.argv[2]!
mkdirSync(out, { recursive: true })
for (const t of TEMPLATES) {
  const cfg = buildDeterministicConfig({ businessId: 'x', name: 'Maison Exemple', sector: t.sector, sectorLabel: t.name.split(' —')[0]!, templateId: t.id, city: 'Rouen', address: '12 rue du Gros-Horloge', postcode: '76000', phoneE164: '+33235000000', phoneDisplay: '02 35 00 00 00', email: 'contact@exemple.test', emailStatus: 'SOURCE_CONFIRMED', lat: 49.4404, lon: 1.0939, socials: [], openingHours: { lines: ['Mardi – Vendredi : 09:00 – 19:00', 'Samedi : 09:00 – 17:00'], source: 'Exemple' }, websiteStatus: 'NO_WEBSITE_KNOWN', websiteUrl: null, auditFindings: [] }, { templateId: t.id, disclaimer: 'Démonstration indépendante.' })
  writeFileSync(`${out}/${t.id}.html`, renderSiteDocument(cfg, { mode: 'preview', banner: 'Démonstration non officielle' }))
}
