import { PageHeader } from '@/components/ui/primitives'
import { aiAvailability } from '@/server/ai/client'
import { getSettings } from '@/server/core/settings'
import { AssistantClient } from './client'

export const metadata = { title: 'Assistant' }
export const dynamic = 'force-dynamic'

export default async function AssistantPage() {
  const [avail, s] = await Promise.all([aiAvailability(), getSettings()])
  const mode = avail.available && s.ai.costMode !== 'LOW_COST' ? `IA (${avail.provider})` : 'règles (sans IA)'
  return (
    <>
      <PageHeader title="Assistant" description={`Pilotez l’outil en langage naturel. Interprétation : ${mode}. Les résultats proviennent uniquement des fonctions de l’application ; toute action qui coûte ou crée des données vous est présentée avant exécution.`} />
      <AssistantClient />
    </>
  )
}
