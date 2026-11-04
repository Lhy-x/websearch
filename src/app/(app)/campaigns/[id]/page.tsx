import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Card, CardHeader, EmptyState, Notice, Table, Td, Th } from '@/components/ui/primitives'
import { Stat } from '@/components/stat'
import { sql } from '@/server/core/db'
import { getRuntimeConfig, getFlags } from '@/server/core/settings'
import { campaignStats } from '@/server/campaigns/queries'

import { fmtDate, fmtInt, fmtPct } from '@/lib/utils'
import { CampaignControls, MessageQueue, ProspectRowActions } from './controls'

export const dynamic = 'force-dynamic'

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = sql()
  const [c] = await db<{ id: string; name: string; description: string; status: string; mode: string; from_name: string | null; from_email: string | null; timezone: string; send_days: number[]; send_start_minute: number; send_end_minute: number; daily_limit: number; min_interval_seconds: number; stop_reason: string | null }[]>`select * from campaigns where id = ${id}`
  if (!c) notFound()
  const [stats] = await campaignStats(id)
  const steps = await db<{ step: number; delay_days: number; content_key: string }[]>`select step, delay_days, content_key from campaign_sequences where campaign_id = ${id} order by step`
  const prospects = await db<{ id: string; business_id: string; name: string; contact_email: string | null; status: string; current_step: number; next_send_at: Date | null; stop_reason: string | null }[]>`
    select cp.id, cp.business_id, b.name, cp.contact_email, cp.status, cp.current_step, cp.next_send_at, cp.stop_reason from campaign_prospects cp join businesses b on b.id = cp.business_id
    where cp.campaign_id = ${id} order by cp.created_at limit 500`
  const messages = await db<{ id: string; business_name: string | null; to_email: string; step: number; subject: string; body_text: string; status: string; scheduled_at: Date | null; sent_at: Date | null; last_error: string | null; provider_message_id: string | null }[]>`
    select o.id, b.name business_name, o.to_email, o.step, o.subject, o.body_text, o.status, o.scheduled_at, o.sent_at, o.last_error, o.provider_message_id
    from outbound_messages o left join businesses b on b.id = o.business_id where o.campaign_id = ${id} order by o.created_at desc limit 300`
  const flags = await getFlags()
  const runtime=await getRuntimeConfig()
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const s = stats!
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted"><Link href="/campaigns" className="hover:text-fg">Campagnes</Link></p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">{c.name} <Badge tone={c.status === 'ACTIVE' ? 'success' : c.status === 'PAUSED' ? 'warning' : c.status === 'STOPPED' ? 'danger' : 'neutral'}>{c.status}</Badge><Badge>{c.mode}</Badge></h1>
          <p className="mt-1 text-xs text-muted">{c.from_name} &lt;{c.from_email ?? 'expéditeur non défini'}&gt; · {c.timezone} · {c.send_days.map((d) => ['L', 'M', 'M', 'J', 'V', 'S', 'D'][d - 1]).join('')} {hm(c.send_start_minute)}–{hm(c.send_end_minute)} · {c.daily_limit}/jour · ≥ {c.min_interval_seconds} s entre envois · fournisseur : {runtime.EMAIL_PROVIDER}</p>
          {c.stop_reason ? <p className="mt-1 text-xs text-warning">{c.stop_reason}</p> : null}
        </div>
        <CampaignControls id={c.id} status={c.status} mode={c.mode} />
      </div>
      {flags.emergencyStop ? <div className="mb-4"><Notice tone="danger" title="Arrêt d’urgence actif">Aucun email n’est envoyé tant que l’arrêt d’urgence est actif (Automatisations).</Notice></div> : null}
      {runtime.EMAIL_PROVIDER === 'sandbox' ? <div className="mb-4"><Notice tone="warning" title="Fournisseur email : sandbox">Les messages sont simulés et enregistrés, jamais envoyés. Configurez Resend ou SMTP (EMAIL_PROVIDER) pour des envois réels.</Notice></div> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Prospects" value={fmtInt(s.prospects)} hint={`${fmtInt(s.active)} en séquence`} />
        <Stat label="À valider" value={fmtInt(s.awaiting)} />
        <Stat label="Programmés" value={fmtInt(s.scheduled)} />
        <Stat label="Envoyés" value={fmtInt(s.sent)} hint={`${fmtInt(s.sent_prospects)} prospects contactés`} />
        <Stat label="Délivrés" value={fmtInt(s.delivered)} hint={`${fmtPct(s.delivered, s.sent)} des envoyés`} />
        <Stat label="Rejetés" value={fmtInt(s.bounced)} hint={`${fmtPct(s.bounced, s.sent)} des envoyés`} />
        <Stat label="Ont répondu" value={fmtInt(s.replied_prospects)} hint={`${fmtPct(s.replied_prospects, s.sent_prospects)} des contactés`} />
        <Stat label="Positives / RDV / clients" value={`${s.positive} / ${s.meetings} / ${s.won}`} />
      </div>
      <p className="mt-2 text-[11px] text-muted">Les ouvertures ne sont pas comptées comme des réponses ; le suivi d’ouverture n’est pas activé (métrique imparfaite).</p>

      <Card className="mt-6">
        <CardHeader title="Séquence" />
        <div className="flex flex-wrap gap-2 p-5 text-xs">
          {steps.map((st) => <Badge key={st.step} tone="primary">Étape {st.step + 1} · {st.step === 0 ? 'J0' : `+${st.delay_days} j`} · {st.content_key}</Badge>)}
        </div>
      </Card>

      <MessageQueue campaignId={c.id} messages={messages.map((m) => ({ ...m, scheduled_at: m.scheduled_at?.toISOString() ?? null, sent_at: m.sent_at?.toISOString() ?? null }))} />

      <Card className="mt-6">
        <CardHeader title={`Prospects (${prospects.length})`} />
        {prospects.length ? (
          <Table>
            <thead><tr><Th>Prospect</Th><Th>Contact</Th><Th>Statut</Th><Th>Étape</Th><Th>Prochain envoi</Th><Th /></tr></thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.id}>
                  <Td><Link href={`/prospects/${p.business_id}`} className="font-medium hover:text-primary">{p.name}</Link></Td>
                  <Td className="text-xs">{p.contact_email}</Td>
                  <Td><Badge tone={p.status === 'ACTIVE' ? 'info' : p.status === 'REPLIED' ? 'success' : ['BOUNCED', 'UNSUBSCRIBED', 'STOPPED'].includes(p.status) ? 'danger' : 'neutral'}>{p.status}</Badge>{p.stop_reason ? <span className="ml-1 text-xs text-muted">{p.stop_reason}</span> : null}</Td>
                  <Td className="text-xs">{p.current_step + 1}/{steps.length}</Td>
                  <Td className="text-xs text-muted">{p.next_send_at ? fmtDate(p.next_send_at) : '—'}</Td>
                  <Td><ProspectRowActions campaignId={c.id} id={p.id} status={p.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="Aucun prospect" description="Sélectionnez des prospects dans la base puis « Ajouter à une campagne »." />}
      </Card>
    </>
  )
}

