import { adminRoute } from '@/server/http/route'
import { recentGenerationBatches } from '@/server/sites/batches'
import { sql } from '@/server/core/db'
export const GET=adminRoute(async()=>{const [batches,[count]]=await Promise.all([recentGenerationBatches(),sql()`select count(*)::int n from automation_jobs where type='website.generate' and status in ('PENDING','RUNNING','RETRYING')`]);return {batches,activeCount:count!.n}})
