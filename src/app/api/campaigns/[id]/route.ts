import { z } from 'zod'
import { sql } from '@/server/core/db'
import { AppError } from '@/server/core/errors'
import { adminRoute } from '@/server/http/route'
import { enqueueJob } from '@/server/jobs/queue'
import { addProspects, approveMessage, approveProspects, setCampaignStatus, tickCampaign } from '@/server/campaigns/service'
import { withComplianceFooter } from '@/server/email/compose'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), status: z.enum(['ACTIVE', 'PAUSED', 'STOPPED']) }),
  z.object({ action: z.literal('add_prospects'), businessIds: z.array(z.string().uuid()).min(1).max(2000) }),
  z.object({ action: z.literal('approve_prospects'), ids: z.array(z.string().uuid()).min(1) }),
  z.object({ action: z.literal('remove_prospect'), id: z.string().uuid() }),
  z.object({ action: z.literal('approve_message'), messageId: z.string().uuid(), subject: z.string().min(1).max(300).optional(), body: z.string().min(1).max(20000).optional() }),
  z.object({ action: z.literal('approve_all') }),
  z.object({ action: z.literal('cancel_message'), messageId: z.string().uuid() }),
  z.object({ action: z.literal('tick') }),
  z.object({ action: z.literal('autofill') }),
])

export const POST = adminRoute(async ({ params, body }) => {
  const db = sql()
  const id = params.id
  switch (body.action) {
    case 'status':
      await setCampaignStatus(id, body.status)
      return { ok: true }
    case 'add_prospects':
      return addProspects(id, body.businessIds)
    case 'approve_prospects':
      await approveProspects(id, body.ids)
      return { ok: true }
    case 'remove_prospect':
      await db`update campaign_prospects set status = 'EXCLUDED', next_send_at = null, stop_reason = 'retiré manuellement' where id = ${body.id} and campaign_id = ${id}`
      await db`update outbound_messages set status = 'CANCELLED' where campaign_prospect_id = ${body.id} and status in ('DRAFT','AWAITING_APPROVAL','SCHEDULED')`
      return { ok: true }
    case 'approve_message': {
      let text = body.body
      if (text) {
        // the opt-out link can't be removed by an edit
        const [m] = await db<{ unsubscribe_token: string }[]>`select unsubscribe_token from outbound_messages where id = ${body.messageId} and campaign_id = ${id}`
        if (!m) throw new AppError('Message introuvable', 404)
        if (!text.includes(m.unsubscribe_token)) text = await withComplianceFooter(text, m.unsubscribe_token)
      }
      await approveMessage(body.messageId, { subject: body.subject, body: text })
      return { ok: true }
    }
    case 'approve_all': {
      const r = await db`update outbound_messages set status = 'SCHEDULED', scheduled_at = greatest(coalesce(scheduled_at, now()), now()) where campaign_id = ${id} and status = 'AWAITING_APPROVAL' returning id`
      return { approved: r.length }
    }
    case 'cancel_message':
      await db`update outbound_messages set status = 'CANCELLED', last_error = 'annulé manuellement' where id = ${body.messageId} and campaign_id = ${id} and status in ('DRAFT','AWAITING_APPROVAL','SCHEDULED')`
      return { ok: true }
    case 'tick':
      return tickCampaign(id)
    case 'autofill':
      return { jobId: (await enqueueJob('campaign.autofill', { campaignId: id }, { priority: 30 })).job.id }
  }
}, schema)
