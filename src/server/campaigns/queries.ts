import { sql } from '../core/db'

export async function campaignStats(campaignId?: string) {
  const db = sql()
  return db<{ id: string; name: string; status: string; mode: string; created_at: Date; daily_limit: number; prospects: number; active: number; scheduled: number; awaiting: number; sent: number; delivered: number; bounced: number; replied_prospects: number; positive: number; meetings: number; won: number; sent_prospects: number }[]>`
    select c.id, c.name, c.status, c.mode, c.created_at, c.daily_limit,
      (select count(*)::int from campaign_prospects cp where cp.campaign_id = c.id) prospects,
      (select count(*)::int from campaign_prospects cp where cp.campaign_id = c.id and cp.status = 'ACTIVE') active,
      (select count(*)::int from outbound_messages o where o.campaign_id = c.id and o.status = 'SCHEDULED') scheduled,
      (select count(*)::int from outbound_messages o where o.campaign_id = c.id and o.status = 'AWAITING_APPROVAL') awaiting,
      (select count(*)::int from outbound_messages o where o.campaign_id = c.id and o.status in ('SENT','DELIVERED','BOUNCED','COMPLAINED')) sent,
      (select count(distinct o.campaign_prospect_id)::int from outbound_messages o where o.campaign_id = c.id and o.status in ('SENT','DELIVERED','BOUNCED','COMPLAINED')) sent_prospects,
      (select count(*)::int from outbound_messages o where o.campaign_id = c.id and o.status = 'DELIVERED') delivered,
      (select count(*)::int from outbound_messages o where o.campaign_id = c.id and o.status = 'BOUNCED') bounced,
      (select count(distinct i.business_id)::int from inbound_messages i join outbound_messages o on o.id = i.outbound_message_id where o.campaign_id = c.id and i.classification not in ('BOUNCE','OUT_OF_OFFICE')) replied_prospects,
      (select count(distinct i.business_id)::int from inbound_messages i join outbound_messages o on o.id = i.outbound_message_id where o.campaign_id = c.id and i.classification in ('INTERESTED','MEETING_REQUEST')) positive,
      (select count(*)::int from campaign_prospects cp join businesses b on b.id = cp.business_id where cp.campaign_id = c.id and b.pipeline_status = 'MEETING_BOOKED') meetings,
      (select count(*)::int from campaign_prospects cp join businesses b on b.id = cp.business_id where cp.campaign_id = c.id and b.pipeline_status = 'WON') won
    from campaigns c where ${campaignId ? db`c.id = ${campaignId}` : db`true`} order by c.created_at desc`
}
