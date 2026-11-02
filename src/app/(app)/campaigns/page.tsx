import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { campaignStats } from '@/server/campaigns/queries'
import { fmtInt, fmtPct } from '@/lib/utils'

export const metadata = { title: 'Campagnes' }
export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const rows = await campaignStats()
  return (
    <>
      <PageHeader title="Campagnes" description="Taux calculés sur des dénominateurs explicites : messages envoyés, ou prospects contactés." actions={<Button asChild><Link href="/campaigns/new"><Plus />Nouvelle campagne</Link></Button>} />
      <Card>
        {rows.length ? (
          <Table>
            <thead><tr><Th>Campagne</Th><Th>Mode</Th><Th className="text-right">Prospects</Th><Th className="text-right">À valider</Th><Th className="text-right">Programmés</Th><Th className="text-right">Envoyés</Th><Th className="text-right">Délivrés / envoyés</Th><Th className="text-right">Réponses / contactés</Th><Th className="text-right">Positives</Th><Th className="text-right">Clients</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-panel-2/60">
                  <Td><Link href={`/campaigns/${c.id}`} className="font-medium hover:text-primary">{c.name}</Link> <Badge tone={c.status === 'ACTIVE' ? 'success' : c.status === 'PAUSED' ? 'warning' : c.status === 'STOPPED' ? 'danger' : 'neutral'}>{c.status}</Badge></Td>
                  <Td className="text-xs">{c.mode}</Td>
                  <Td className="tabular text-right">{fmtInt(c.prospects)}</Td>
                  <Td className="tabular text-right">{fmtInt(c.awaiting)}</Td>
                  <Td className="tabular text-right">{fmtInt(c.scheduled)}</Td>
                  <Td className="tabular text-right">{fmtInt(c.sent)}</Td>
                  <Td className="tabular text-right">{fmtPct(c.delivered, c.sent)}</Td>
                  <Td className="tabular text-right">{fmtInt(c.replied_prospects)} ({fmtPct(c.replied_prospects, c.sent_prospects)})</Td>
                  <Td className="tabular text-right">{fmtInt(c.positive)}</Td>
                  <Td className="tabular text-right">{fmtInt(c.won)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="Aucune campagne" action={<Button asChild><Link href="/campaigns/new">Créer une campagne</Link></Button>} />}
      </Card>
    </>
  )
}
