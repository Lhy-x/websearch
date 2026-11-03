import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/primitives'
import { getSettings } from '@/server/core/settings'
import { CONNECTORS } from '@/server/connectors'
import { SearchWorkspace } from './workspace'

export const metadata = { title: 'Recherche de prospects' }

export default async function SearchPage() {
  const settings = await getSettings()
  const connectors = await Promise.all(CONNECTORS.map(async (c) => ({ id: c.id, label: c.label, ...(await c.status()) })))
  return (
    <>
      <PageHeader title="Recherche de prospects" description="Trouvez les entreprises à qui proposer votre prochain site. Commencez par votre ville et votre activité cible." />
      <Suspense>
        <SearchWorkspace defaults={{ country: settings.search.defaultCountry, radiusKm: settings.search.defaultRadiusKm, maxResults: settings.search.maxResults }} connectors={connectors} />
      </Suspense>
    </>
  )
}
