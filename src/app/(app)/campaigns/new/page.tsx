import { PageHeader } from '@/components/ui/primitives'
import { sql } from '@/server/core/db'
import { getSettings } from '@/server/core/settings'
import { NewCampaignForm } from './form'

export const metadata = { title: 'Nouvelle campagne' }

export default async function NewCampaignPage() {
  const [offers, strategies, saved, settings] = await Promise.all([
    sql()<{ id: string; name: string }[]>`select id, name from sales_offers where active order by created_at`,
    sql()<{ id: string; name: string }[]>`select id, name from prompt_strategies order by is_default desc, created_at`,
    sql()<{ id: string; name: string }[]>`select id, name from saved_searches order by created_at desc`,
    getSettings(),
  ])
  return (
    <>
      <PageHeader title="Nouvelle campagne" description="Aucun envoi n’a lieu tant que la campagne n’est pas activée. En mode manuel, chaque message doit être validé." />
      <NewCampaignForm offers={offers} strategies={strategies} saved={saved} defaults={{ fromName: settings.outreach.senderName, fromEmail: settings.outreach.senderEmail, replyTo: settings.outreach.replyTo, dailyLimit: settings.outreach.defaultDailyLimit, delays: settings.outreach.followupDelaysDays }} />
    </>
  )
}
