import Stripe from 'stripe'
import { sql } from '../core/db'
import { AppError } from '../core/errors'

export type CheckoutDiagnostic = {
  at: string
  category: string
  message: string
  action: string
  detail: string | null
  requestId: string | null
  parameter: string | null
  operation: 'create' | 'retrieve'
}

// Never serialize a Stripe error: it can include request headers and credentials.
export function redactStripeDetail(value: string) {
  return value.slice(0, 6000)
    .replace(/\b(?:sk|rk|pk)_(?:test|live)_[^\s'"`,;<>]+/gi, '[clé masquée]')
    .replace(/\bwhsec_[^\s'"`,;<>]+/gi, '[secret masqué]')
    .replace(/\b(?:pi|seti|cs)_[A-Za-z0-9_]*_secret_[A-Za-z0-9_]+/g, '[secret client masqué]')
    .replace(/\bBearer\s+[^\s'"`,;<>]+/gi, 'Bearer [masqué]')
    .replace(/https?:\/\/[^\s<>"']+/gi, '[adresse masquée]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email masqué]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 1200)
}
// A StripeConnectionError hides the real network error (TLS, DNS, firewall…) in `detail` and its `cause` chain.
const NETWORK_CAUSES: { test: RegExp; message: string; action: string }[] = [
  { test: /CERT|UNABLE_TO_(?:GET|VERIFY)|SELF_SIGNED|ERR_TLS|ERR_SSL/, message: 'Le certificat HTTPS présenté pour Stripe n’est pas reconnu par Node.js.',
    action: 'Un antivirus, un VPN ou un proxy d’entreprise inspecte probablement les connexions HTTPS. Relancez l’application avec LANCER-MAC.command (Node.js utilise alors aussi les certificats du trousseau macOS) ou excluez api.stripe.com de l’inspection HTTPS.' },
  { test: /^(?:ENOTFOUND|EAI_AGAIN|EAI_FAIL|EAI_NONAME)$/, message: 'Le serveur ne trouve pas l’adresse de Stripe (DNS).',
    action: 'Vérifiez la connexion Internet, le DNS ou le VPN du Mac, puis réessayez.' },
  { test: /^(?:ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EPERM|EACCES|EADDRNOTAVAIL)$/, message: 'La connexion sortante vers Stripe est bloquée.',
    action: 'Autorisez Node.js à se connecter à api.stripe.com dans le pare-feu (pare-feu macOS, Little Snitch, LuLu, antivirus) ou le VPN, puis réessayez.' },
  { test: /TIMEOUT|ETIMEDOUT|ECONNRESET|EPIPE|UND_ERR_SOCKET|ECONNABORTED/, message: 'La connexion à Stripe a été coupée ou a expiré.',
    action: 'Vérifiez la stabilité de la connexion Internet, du VPN ou du proxy, puis réessayez. La commande conserve la même demande de paiement pour éviter les doublons.' },
]
export function networkCause(error: unknown) {
  const queue: unknown[] = [error], seen = new Set<unknown>(), parts: string[] = []
  let code: string | null = null
  while (queue.length && seen.size < 12) {
    const current = queue.shift()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    const value = current as { code?: unknown; message?: unknown; detail?: unknown; cause?: unknown; errors?: unknown }
    const own = typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{2,60}$/.test(value.code) ? value.code : null
    if (own) code ??= own
    if (current !== error && typeof value.message === 'string' && value.message) parts.push(own && !value.message.includes(own) ? `${own} ${value.message}` : value.message)
    queue.push(value.detail, value.cause, ...(Array.isArray(value.errors) ? value.errors : []))
  }
  const known = code ? NETWORK_CAUSES.find(cause => cause.test.test(code!)) : undefined
  return { code, summary: [...new Set(parts)].join(' — ') || null, message: known?.message ?? null, action: known?.action ?? null }
}
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_.[\]-]{1,100}$/.test(value) ? value : null

export function checkoutFailure(error: unknown) {
  const stripeError = error instanceof Stripe.errors.StripeError ? error : null
  const text = stripeError?.message.toLowerCase() ?? ''
  const parameter = identifier(stripeError?.param)
  const code = stripeError?.code
  let networkDetail = ''
  let category = 'unavailable', message = 'Stripe ne peut pas ouvrir le paiement pour le moment.', action = 'Réessayez. Si le refus persiste, consultez les journaux de requêtes dans Stripe avec la référence ci-dessous.'
  if (stripeError instanceof Stripe.errors.StripeAuthenticationError) {
    category = 'authentication'; message = 'La clé Stripe configurée est refusée.'
    action = 'Dans Paiement, enregistrez une clé valide du bon compte et du bon mode. Vérifiez qu’elle n’a pas été révoquée.'
  } else if (stripeError instanceof Stripe.errors.StripePermissionError) {
    category = 'permissions'; message = 'La clé Stripe n’a pas les autorisations nécessaires.'
    action = 'Vérifiez les droits de la clé sur Checkout, les clients et la facturation. Une clé restreinte doit autoriser les opérations demandées.'
  } else if (stripeError instanceof Stripe.errors.StripeConnectionError) {
    const cause = networkCause(stripeError)
    category = 'connection'; message = cause.message ?? 'La connexion à Stripe a échoué.'
    action = cause.action ?? 'Vérifiez l’accès Internet du serveur et réessayez. La commande conserve la même demande de paiement pour éviter les doublons.'
    networkDetail = cause.summary ? ` Cause : ${cause.summary}` : ''
  } else if (stripeError instanceof Stripe.errors.StripeRateLimitError) {
    category = 'rate_limit'; message = 'Stripe reçoit trop de demandes. Patientez avant de réessayer.'
    action = 'Attendez quelques instants, puis reprenez le paiement. La demande conserve sa protection contre les doublons.'
  } else if (parameter?.includes('tax_rates') || /no such tax rate|tax rate.*(?:invalid|inactive|mode)/i.test(text)) {
    category = 'tax_rate'; message = 'Le taux de TVA configuré est refusé par Stripe.'
    action = 'Dans Paiement → TVA, vérifiez que le taux txr_… existe et est actif dans le même compte et le même mode Stripe. Retirez-le uniquement si aucun taux ne doit s’appliquer.'
  } else if (parameter?.startsWith('managed_payments') || /managed payments|product tax code|tax_code/.test(text)) {
    category = 'managed_payments'; message = 'Stripe Managed Payments est activé sur ce compte et exige un code fiscal produit.'
    action = 'L’application désactive Managed Payments pour chaque paiement. Si ce refus apparaît encore, désactivez Managed Payments par défaut dans les réglages Stripe du mode utilisé (Paramètres → Managed Payments), puis réessayez.'
  } else if (/business.{0,30}name|business_profile|business.{0,30}address/.test(text)) {
    category = 'business_profile'; message = 'Le profil professionnel Stripe doit être complété.'
    action = 'Dans le tableau de bord Stripe du mode utilisé, complétez le nom public et l’adresse de votre entreprise, puis les informations de facturation demandées par Stripe.'
  } else if (code === 'account_invalid' || /account.*(?:activated|enabled|restricted)|capabilit|accept payments/.test(text)) {
    category = 'account'; message = 'Le compte Stripe doit être configuré pour accepter ce paiement.'
    action = 'Dans Stripe, consultez les actions requises du compte et activez les moyens de paiement adaptés à la devise choisie, dans le bon mode.'
  } else if (stripeError instanceof Stripe.errors.StripeInvalidRequestError) {
    category = 'invalid_request'; message = 'Stripe a refusé la configuration de ce paiement.'
    action = 'Consultez le détail du refus ci-dessous et corrigez le paramètre indiqué. La facture reste demandée ; aucune option n’est retirée automatiquement pour contourner le refus.'
  }
  const definitive = stripeError instanceof Stripe.errors.StripeAuthenticationError || stripeError instanceof Stripe.errors.StripePermissionError || stripeError instanceof Stripe.errors.StripeInvalidRequestError
  return { category, message, action, detail: stripeError ? redactStripeDetail(stripeError.message + networkDetail) : null, parameter, requestId: stripeError?.requestId?.match(/^req_[a-zA-Z0-9]+$/)?.[0] ?? null, definitive }
}

const keyFor = (live: boolean) => `billing:checkout-diagnostic:${live ? 'live' : 'test'}`
type CheckoutContext = { orderId: string; live: boolean; operation: CheckoutDiagnostic['operation'] }
async function storeCheckoutFailure(failure: Omit<CheckoutDiagnostic, 'at' | 'operation'>, context: CheckoutContext) {
  const record = { ...failure, at: new Date().toISOString(), operation: context.operation, orderId: context.orderId }
  // Only sanitized Stripe fields are logged; unknown exceptions are not printed.
  console.error('[stripe checkout]', { mode: context.live ? 'live' : 'test', ...record })
  await sql()`insert into kv_store(key,value) values(${keyFor(context.live)},${sql().json(record)}) on conflict(key) do update set value=excluded.value,updated_at=now()`
  return new AppError(`${failure.message} Réessayez ou contactez le vendeur.${failure.requestId ? ' Référence : ' + failure.requestId + '.' : ''}`, 502, 'STRIPE_' + failure.category.toUpperCase())
}
export async function recordCheckoutFailure(error: unknown, context: CheckoutContext) {
  const { definitive, ...failure } = checkoutFailure(error)
  return { definitive, error: await storeCheckoutFailure(failure, context) }
}
export type CheckoutProblem = { category: string; message: string; action: string }
/** A configuration problem detected before Stripe is asked to create the session (always definitive). */
export async function recordCheckoutProblem(problem: CheckoutProblem, context: CheckoutContext) {
  return storeCheckoutFailure({ ...problem, detail: null, parameter: null, requestId: null }, context)
}
export async function clearCheckoutFailure(orderId: string, live: boolean, startedAt: string) {
  // A successful retry can use a new order after a definitive configuration refusal.
  // Keep a newer failure from another request if one happened concurrently.
  await sql()`delete from kv_store where key=${keyFor(live)} and (value->>'orderId'=${orderId} or value->>'at'<=${startedAt})`
}
export async function checkoutDiagnostics() {
  const rows = await sql()< {key:string;value:CheckoutDiagnostic}[]>`select key,value from kv_store where key in (${keyFor(false)},${keyFor(true)})`
  return {test: rows.find(row => row.key === keyFor(false))?.value ?? null, live: rows.find(row => row.key === keyFor(true))?.value ?? null}
}
