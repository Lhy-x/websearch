// Dev check: one real bespoke generation through the logged-in `claude` CLI, then screenshots.
import { closeDb, sql } from '../../src/server/core/db'
import { updateSettings } from '../../src/server/core/settings'
import { generateBespokeWebsite } from '../../src/server/sites/bespoke/generate'
import { captureWebsite } from '../../src/server/sites/screenshots'
import { closeBrowser } from '../../src/server/enrich/browser'

const name = process.argv[2] ?? 'Hair & Style'
await updateSettings({ ai: { provider: 'claude-code', strongModel: 'opus', cheapModel: 'haiku', costMode: 'HIGH_QUALITY' }, sites: { generationMode: 'bespoke', qualityPasses: 1, visualReview: true } })
const [b] = await sql()<{ id: string }[]>`select id from businesses where name = ${name} order by score desc limit 1`
const t = Date.now()
const r = await generateBespokeWebsite(b!.id, { log: (m) => console.log('·', m) })
console.log(JSON.stringify({ websiteId: r.websiteId, model: r.model, passes: r.passes, issues: r.issues, seconds: Math.round((Date.now() - t) / 1000), preview: `/preview/${r.previewToken}` }, null, 1))
const c = await captureWebsite(r.websiteId)
console.log(c.assets.map((a) => a.path).join('\n'))
await closeBrowser()
await closeDb()
