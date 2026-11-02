import { PageHeader } from '@/components/ui/primitives'
import { sql } from '@/server/core/db'
import { getSettings, secretStatus } from '@/server/core/settings'
import { infraStatus } from '@/server/infra'
import { SettingsClient } from './client'

export const metadata = { title: 'Paramètres' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const db = sql()
  const [settings, secrets, infra, offers, strategies, suppression] = await Promise.all([
    getSettings(),
    secretStatus(),
    infraStatus(),
    db<{ id: string; name: string; kind: string; description: string; price_cents: number | null; active: boolean }[]>`select id, name, kind, description, price_cents, active from sales_offers order by created_at`,
    db<{ id: string; name: string; instructions: string; tone: string; is_default: boolean }[]>`select id, name, instructions, tone, is_default from prompt_strategies order by created_at`,
    db<{ id: string; email: string | null; domain: string | null; reason: string; source: string | null; created_at: Date }[]>`select id, email, domain, reason, source, created_at from suppression_list order by created_at desc limit 300`,
  ])
  return (
    <>
      <PageHeader title="Paramètres" description="Réglages enregistrés en base et utilisés par l’application et les workers. Les secrets saisis ici sont chiffrés (AES-256-GCM) ; une variable d’environnement est toujours prioritaire." />
      <SettingsClient
        settings={settings}
        secrets={secrets}
        infra={JSON.parse(JSON.stringify(infra))}
        offers={offers}
        strategies={strategies}
        suppression={suppression.map((s) => ({ ...s, created_at: s.created_at.toISOString() }))}
      />
    </>
  )
}
