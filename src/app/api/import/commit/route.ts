import { adminRoute } from '@/server/http/route'
import { enqueueJob } from '@/server/jobs/queue'
import { importCommitSchema } from '@/server/connectors/import'

export const POST = adminRoute(async ({ body }) => {
  const { job } = await enqueueJob('import.run', body, { priority: 40, maxAttempts: 1 })
  return { jobId: job.id }
}, importCommitSchema)
