import { z } from 'zod'
import { sql } from '../core/db'
import { AppError } from '../core/errors'
import { sha256 } from '../core/crypto'
import { auditLog } from '../core/audit'
import { getPreviewBaseUrl, getSettings } from '../core/settings'
import { getEmailProvider } from '../email/providers'
import { enqueueJob } from '../jobs/queue'
import { publicBase } from './stripe'

/**
 * Customers have no password: their private space is a secret link. To find it again they give the email
 * Stripe collected at checkout and receive the link(s) of their paid orders by email. The answer never says
 * whether the address is known, and requests are throttled per IP and per address.
 */
const emailSchema = z.string().trim().toLowerCase().email().max(320)
const MAX_PER_IP = 10 // per 15 minutes
const MAX_PER_EMAIL = 3 // per hour

type AccessOrder = { access_token: string; business_name: string; livemode: boolean }

async function paidOrders(email: string) {
  return sql()<AccessOrder[]>`select access_token,business_name,livemode from website_orders where lower(buyer_email)=${email} and status='PAID' order by paid_at desc nulls last limit 10`
}
async function spaceUrl(order: AccessOrder) {
  return `${publicBase(order.livemode, await getPreviewBaseUrl(await getSettings()))}/purchase/${order.access_token}`
}

export async function requestCustomerAccess(input: unknown, ip: string) {
  const parsed = emailSchema.safeParse(input)
  if (!parsed.success) throw new AppError('Saisissez une adresse email valide.', 400, 'INVALID_EMAIL')
  const email = parsed.data, emailHash = sha256(email), db = sql()
  const [{ n } = { n: 0 }] = await db<{ n: number }[]>`select count(*)::int n from customer_access_requests where ip=${ip} and created_at > now() - interval '15 minutes'`
  if (n >= MAX_PER_IP) throw new AppError('Trop de demandes. Réessayez dans 15 minutes.', 429, 'RATE_LIMITED')
  const [{ m } = { m: 0 }] = await db<{ m: number }[]>`select count(*)::int m from customer_access_requests where email_hash=${emailHash} and created_at > now() - interval '1 hour'`
  await db`insert into customer_access_requests(ip,email_hash) values(${ip},${emailHash})`
  // Same answer when throttled: it must not reveal whether this address bought something.
  if (m >= MAX_PER_EMAIL) return { sent: true as const, testLinks: [] }
  const orders = await paidOrders(email)
  if (!orders.length) return { sent: true as const, testLinks: [] }
  // In test mode no email ever leaves the app (sandbox provider): show test orders' links directly so the flow can be tried.
  // Real orders are only ever revealed by email.
  if ((await getEmailProvider()).id === 'sandbox') {
    if (orders.some(o => o.livemode)) await auditLog({ action: 'customer.access_email', level: 'warn', data: { error: 'Aucun fournisseur d’email réel : un client n’a pas pu recevoir le lien de son espace.' } })
    const testLinks = await Promise.all(orders.filter(o => !o.livemode).map(async o => ({ businessName: o.business_name, url: await spaceUrl(o) })))
    return { sent: true as const, testLinks }
  }
  await enqueueCustomerAccessEmail(email, 'request')
  return { sent: true as const, testLinks: [] }
}

export async function enqueueCustomerAccessEmail(email: string, reason: 'request' | 'paid', orderId?: string) {
  const key = reason === 'paid' ? `customer-access:paid:${orderId}` : `customer-access:${sha256(email)}:${Math.floor(Date.now() / 600000)}`
  await enqueueJob('customer.access_email', { email, reason, key }, { priority: 10, maxAttempts: 4, idempotencyKey: key })
}

/** Job handler: email every paid order link for this address. */
export async function deliverCustomerAccess(payload: unknown) {
  const { email, reason, key } = z.object({ email: emailSchema, reason: z.enum(['request', 'paid']), key: z.string().max(200) }).parse(payload)
  const orders = await paidOrders(email)
  if (!orders.length) return { sent: 0 }
  const provider = await getEmailProvider()
  if (provider.id === 'sandbox') return { sent: 0, skipped: 'aucun envoi d’email réel configuré (mode test ou fournisseur absent)' }
  const settings = await getSettings()
  const from = settings.outreach.senderEmail
  if (!from) {
    await auditLog({ action: 'customer.access_email', level: 'warn', data: { error: 'Email expéditeur manquant (Paramètres → Prospection)' } })
    return { sent: 0, skipped: 'email expéditeur manquant' }
  }
  const links = await Promise.all(orders.map(async o => `• ${o.business_name}${o.livemode ? '' : ' (test)'} : ${await spaceUrl(o)}`))
  const intro = reason === 'paid'
    ? 'Merci pour votre paiement. Votre site est prêt : vous pouvez le télécharger, l’héberger et relier votre nom de domaine depuis votre espace client.'
    : 'Vous avez demandé à retrouver votre espace client. Le voici :'
  const text = [
    'Bonjour,', '', intro, '', ...links, '',
    'Ce lien est personnel : il donne accès à votre espace sans mot de passe. Ne le partagez pas.',
    'Vous pourrez toujours le retrouver en saisissant cette adresse email sur la page « Retrouver mon espace ».', '',
    'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message.',
  ].join('\n')
  // Stable per job so a retried job is not delivered twice by the provider.
  const domain = from.split('@')[1] ?? 'localhost'
  await provider.send({
    from, fromName: settings.outreach.senderName || null, to: email, replyTo: settings.outreach.replyTo || null,
    subject: reason === 'paid' ? 'Votre espace client et votre site' : 'Le lien de votre espace client',
    text, messageId: `<${sha256(key).slice(0, 32)}@${domain}>`, idempotencyKey: key, headers: {},
  })
  return { sent: orders.length }
}
