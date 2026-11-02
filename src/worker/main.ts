import { closeDb } from '../server/core/db'
import { closeBrowser } from '../server/enrich/browser'
import { Worker } from '../server/jobs/runner'
import { migrate } from '../../scripts/migrate'

/**
 * Long-running worker process: `npm run worker`.
 * Runs jobs from the persistent Postgres queue, fires schedules, ticks campaigns, recovers crashed jobs.
 */
async function main() {
  await migrate(() => undefined)
  const worker = new Worker()
  const shutdown = async (sig: string) => {
    console.log(`[worker] ${sig} reçu, arrêt propre…`)
    await worker.stop()
    await closeBrowser()
    await closeDb()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  // a single faulty job must never take the whole worker down
  process.on('unhandledRejection', (e) => console.error('[worker] rejet non géré :', e))
  await worker.start()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
