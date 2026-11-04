export const RESEND_WEBHOOK_EVENTS = ['email.sent', 'email.delivered', 'email.bounced', 'email.complained'] as const

export type ResendWebhookStatus = {
  keyConfigured: boolean
  secretConfigured: boolean
  defaultBase: string
  webhook: { id: string; endpoint: string; status: 'enabled' | 'disabled'; updatedAt: string } | null
}
