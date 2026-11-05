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
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_.[\]-]{1,100}$/.test(value) ? value : null

export function checkoutFailure(error: unknown) {
  const stripeError = error instanceof Stripe.errors.StripeError ? error : null
  const text = stripeError?.message.toLowerCase() ?? ''
  const parameter = identifier(stripeError?.param)
  const code = stripeError?.code
  let category = 'unavailable', message = 'Stripe ne peut pas ouvrir le paiement pour le moment.', action = 'Réessayez. Si le refus persiste, consultez les journaux de requêtes dans Stripe avec la référence ci-dessous.'
  if (stripeError instanceof Stripe.errors.StripeAuthenticationError) {
    category = 'authentication'; message = 'La clé Stripe configurée est refusée.'
    action = 'Dans Paiement, enregistrez une clé valide du bon compte et du bon mode. Vérifiez qu’elle n’a pas été révoquée.'
  } else if (stripeError instanceof Stripe.errors.StripePermissionError) {
    category = 'permissions'; message = 'La clé Stripe n’a pas les autorisations nécessaires.'
    action = 'Vérifiez les droits de la clé sur Checkout, les clients et la facturation. Une clé restreinte doit autoriser les opérations demandées.'
  } else if (stripeError instanceof Stripe.errors.StripeConnectionError) {
    category = 'connection'; message = 'La connexion à Stripe a échoué.'
    action = 'Vérifiez l’accès Internet du serveur et réessayez. La commande conserve la même demande de paiement pour éviter les doublons.'
  } else if (stripeError instanceof Stripe.errors.StripeRateLimitError) {
    category = 'rate_limit'; message = 'Stripe reçoit trop de demandes. Patientez avant de réessayer.'
    action = 'Attendez quelques instants, puis reprenez le paiement. La demande conserve sa protection contre les doublons.'
  } else if (parameter?.includes('tax_rates') || /no such tax rate|tax rate.*(?:invalid|inactive|mode)/i.test(text)) {
    category = 'tax_rate'; message = 'Le taux de TVA configuré est refusé par Stripe.'
    action = 'Dans Paiement → TVA, vérifiez que le taux txr_… existe et est actif dans le même compte et le même mode Stripe. Retirez-le uniquement si aucun taux ne doit s’appliquer.'
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
  return { category, message, action, detail: stripeError ? redactStripeDetail(stripeError.message) : null, parameter, requestId: stripeError?.requestId?.match(/^req_[a-zA-Z0-9]+$/)?.[0] ?? null, definitive }
}

const keyFor = (live: boolean) => `billing:checkout-diagnostic:${live ? 'live' : 'test'}`
export async function recordCheckoutFailure(error: unknown, context: { orderId: string; live: boolean; operation: CheckoutDiagnostic['operation'] }) {
  const { definitive, ...failure } = checkoutFailure(error)
  const record = { ...failure, at: new Date().toISOString(), operation: context.operation, orderId: context.orderId }
  // Only sanitized Stripe fields are logged; unknown exceptions are not printed.
  console.error('[stripe checkout]', { mode: context.live ? 'live' : 'test', ...record })
  await sql()`insert into kv_store(key,value) values(${keyFor(context.live)},${sql().json(record)}) on conflict(key) do update set value=excluded.value,updated_at=now()`
  return { definitive, error: new AppError(`${failure.message} Réessayez ou contactez le vendeur.${failure.requestId ? ' Référence : ' + failure.requestId + '.' : ''}`, 502, 'STRIPE_' + failure.category.toUpperCase()) }
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
