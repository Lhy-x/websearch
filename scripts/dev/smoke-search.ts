import { closeDb, sql } from '../../src/server/core/db'
import { runSearch } from '../../src/server/search/run-search'
import { searchParamsSchema } from '../../src/server/search/params'
import { generateWebsite } from '../../src/server/sites/service'

const params = searchParamsSchema.parse({ country: 'FR', city: 'Rouen', radiusKm: 10, sector: 'hair_salon', sources: ['overture', 'recherche_entreprises'] })
const db = sql()
const [run] = await db<{ id: string }[]>`insert into search_runs (params) values (${db.json(params as never)}) returning id`
const t = Date.now()
const res = await runSearch(run!.id, params, async (m) => console.log('  ·', m))
console.log({ ms: Date.now() - t, total: res.totalFound, new: res.newCount, pending: res.mergePending, reports: res.reports })
const stats = await db`select web_presence_status, count(*)::int n, round(avg(score)) avg_score from businesses where id = any(${res.businessIds}::uuid[]) group by 1 order by 2 desc`
console.table(stats)
const top = await db`select id, name, city, web_presence_status, email, phone, score, priority from businesses where id = any(${res.businessIds}::uuid[]) order by score desc limit 5`
console.table(top)
const g = await generateWebsite(top[0]!.id as string)
console.log('site', g)
await closeDb()
