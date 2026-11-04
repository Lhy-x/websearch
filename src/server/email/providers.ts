import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import nodemailer from 'nodemailer'
import { NotConfiguredError, TransientError } from '../core/errors'
import { getRuntimeConfig, getSecret, getSettings } from '../core/settings'

export interface OutgoingEmail {
  from: string
  fromName?: string | null
  to: string
  replyTo?: string | null
  subject: string
  text: string
  messageId: string
  headers: Record<string, string>
  idempotencyKey: string
}

export interface SendResult {
  provider: string
  providerMessageId: string
}

export interface EmailProvider {
  id: 'sandbox' | 'resend' | 'smtp'
  send(e: OutgoingEmail): Promise<SendResult>
}

/** Sandbox: never contacts any server. Messages are only recorded (used in tests and until a provider is configured). */
export const sandboxProvider: EmailProvider = {
  id: 'sandbox',
  async send() {
    return { provider: 'sandbox', providerMessageId: `sandbox_${randomUUID()}` }
  },
}

const fromHeader = (e: OutgoingEmail) => (e.fromName ? `${e.fromName.replace(/[<>"]/g, '')} <${e.from}>` : e.from)

export function resendProvider(apiKey: string): EmailProvider {
  return {
    id: 'resend',
    async send(e) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'Idempotency-Key': e.idempotencyKey.slice(0, 256) },
        body: JSON.stringify({ from: fromHeader(e), to: [e.to], subject: e.subject, text: e.text, reply_to: e.replyTo || undefined, headers: { ...e.headers, 'Message-ID': e.messageId } }),
        signal: AbortSignal.timeout(20_000),
      })
      if (res.status === 429 || res.status >= 500) throw new TransientError(`Resend HTTP ${res.status}`, res.status === 429 ? 60_000 : undefined)
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
      if (!res.ok || !body.id) throw new Error(`Resend HTTP ${res.status}: ${body.message ?? 'erreur'}`)
      return { provider: 'resend', providerMessageId: body.id }
    },
  }
}

export function smtpProvider(opts: { host: string; port: number; secure: boolean; user: string; pass: string }): EmailProvider {
  const transport = nodemailer.createTransport({ host: opts.host, port: opts.port, secure: opts.secure, auth: opts.user ? { user: opts.user, pass: opts.pass } : undefined })
  return {
    id: 'smtp',
    async send(e) {
      try {
        const info = await transport.sendMail({ from: fromHeader(e), to: e.to, replyTo: e.replyTo || undefined, subject: e.subject, text: e.text, messageId: e.messageId, headers: e.headers })
        return { provider: 'smtp', providerMessageId: info.messageId || e.messageId }
      } catch (err) {
        const code = (err as { responseCode?: number }).responseCode
        if (!code || code >= 400 && code < 500) throw new TransientError(`SMTP: ${(err as Error).message}`)
        throw err
      }
    },
  }
}

export async function getEmailProvider(): Promise<EmailProvider> {
  if((await getSettings()).launch.mode==='test')return sandboxProvider
  const e = await getRuntimeConfig()
  if (e.EMAIL_PROVIDER === 'resend') {
    const key = await getSecret('RESEND_API_KEY')
    if (!key) throw new NotConfiguredError('Resend', 'RESEND_API_KEY manquante')
    return resendProvider(key)
  }
  if (e.EMAIL_PROVIDER === 'smtp') {
    if (!e.SMTP_HOST) throw new NotConfiguredError('SMTP', 'SMTP_HOST manquant')
    return smtpProvider({ host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_SECURE, user: e.SMTP_USER, pass: await getSecret('SMTP_PASSWORD') })
  }
  return sandboxProvider
}

/** Verify a Svix-signed webhook (Resend). Signature header: "v1,<base64> v1,<base64>". */
export function verifySvixSignature(secret: string, id: string, timestamp: string, body: string, signatureHeader: string, now = Date.now()): boolean {
  if (!secret || !id || !timestamp || !signatureHeader) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 5 * 60) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()
  return signatureHeader.split(' ').some((part) => {
    const [, sig] = part.split(',')
    if (!sig) return false
    const got = Buffer.from(sig, 'base64')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
}
