export const STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'invoice.paid',
  'invoice.finalized',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const

export type StripeListenerStatus = {
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  cliAvailable: boolean
  forwardTo: string | null
  startedAt: string | null
  secretSaved: boolean
  error: string | null
}
