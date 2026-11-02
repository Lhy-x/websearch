import { closeDb, sql } from '../../src/server/core/db'
import { auditWebsite } from '../../src/server/enrich/audit'
import { crawlOfficialWebsite } from '../../src/server/enrich/crawl'
import { closeBrowser } from '../../src/server/enrich/browser'

const db = sql()
const [b] = await db<{ id: string }[]>`insert into businesses (name, normalized_name, tags) values ('TEST audit local', 'test audit local', '{test-data}') returning id`
for (const url of ['http://localhost:8765/index.html', 'http://localhost:8765/old.html']) {
  const a = await auditWebsite(b!.id, url, { allowPrivate: true })
  console.log(url, '→ score', a.score, a.presence, a.issues.map((i) => i.code).join(','), 'shots', !!a.facts)
}
const c = await crawlOfficialWebsite(b!.id, 'http://localhost:8765/old.html', { allowPrivate: true })
console.log('crawl', c.reachable, c.emailsFound)
// SSRF: the same URL without allowPrivate must be refused
try { await auditWebsite(b!.id, 'http://localhost:8765/index.html') ; console.log('SSRF NOT BLOCKED') } catch (e) { console.log('SSRF blocked:', (e as Error).message) }
await db`delete from businesses where id = ${b!.id}`
await closeBrowser(); await closeDb()
