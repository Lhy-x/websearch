import { sql } from '@/server/core/db'
import { adminRoute } from '@/server/http/route'
import { campaignStats } from '@/server/campaigns/queries'
import { createCampaign } from '@/server/campaigns/service'

export const GET = adminRoute(async ({ req }) => {
  if (new URL(req.url).searchParams.get('min')) return sql()`select id, name, status from campaigns order by created_at desc`
  return campaignStats()
})

export const POST = adminRoute(async ({ req }) => ({ id: await createCampaign(await req.json()) }))
