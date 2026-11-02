import { sql } from '@/server/core/db'
import { suppress } from '@/server/email/suppression'

const html = (title: string, body: string) =>
  new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui;max-width:520px;margin:12vh auto;padding:0 20px;color:#222"><h1 style="font-size:20px">${title}</h1>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" } })

async function find(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const [m] = await sql()<{ to_email: string; business_id: string | null }[]>`select to_email, business_id from outbound_messages where unsubscribe_token = ${token}`
  return m ?? null
}

/** Opt-out page (GET shows a confirmation; POST — including RFC 8058 one-click — applies it). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const m = await find(token)
  if (!m) return html('Lien invalide', '<p>Ce lien de désinscription n’est pas reconnu.</p>')
  return html('Ne plus recevoir de messages', `<p>Confirmez-vous ne plus vouloir recevoir de messages à l’adresse <b>${m.to_email.replace(/[<>&"]/g, '')}</b> ?</p><form method="post"><button style="padding:10px 18px;font-size:15px">Confirmer la désinscription</button></form>`)
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const m = await find(token)
  if (!m) return html('Lien invalide', '<p>Ce lien de désinscription n’est pas reconnu.</p>')
  await suppress({ email: m.to_email, businessId: m.business_id, reason: 'UNSUBSCRIBE', source: 'unsubscribe-link' })
  return html('Désinscription confirmée', '<p>Vous ne recevrez plus de messages de notre part. Toutes nos excuses pour le dérangement.</p>')
}
