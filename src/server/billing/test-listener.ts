import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { STRIPE_WEBHOOK_EVENTS, type StripeListenerStatus } from '@/lib/stripe-listener'
import { AppError } from '../core/errors'
import { encryptSecret } from '../core/crypto'
import { sql } from '../core/db'

async function saveTestKeys(apiKey: string, webhookSecret: string) {
  const secrets = { STRIPE_SECRET_KEY: encryptSecret(apiKey), STRIPE_WEBHOOK_SECRET: encryptSecret(webhookSecret) }
  await sql()`update admin_settings set secrets=secrets || ${sql().json(secrets)},updated_at=now() where id=1`
}

async function findStripeCli(): Promise<string | null> {
  const directories = [...(process.env.PATH ?? '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin']
  for (const directory of new Set(directories.filter(Boolean))) {
    const file = path.join(directory, process.platform === 'win32' ? 'stripe.exe' : 'stripe')
    try { await access(file, constants.X_OK); return file } catch { /* try the next installation */ }
  }
  return null
}

export function stripeForwardTarget(requestUrl: string): string {
  const requested = new URL(requestUrl)
  const port = Number(process.env.PORT || requested.port || '3000')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError('Port local invalide', 400)
  // Always the application on this machine, never a browser-supplied external destination.
  return `http://127.0.0.1:${port}/api/webhooks/stripe`
}

/** Owns one non-detached CLI process. No keys or raw CLI output are exposed to the browser. */
export class StripeTestListener {
  private child: ChildProcess | null = null
  private fingerprint = ''
  private pending: Promise<unknown> = Promise.resolve()
  private snapshot: Omit<StripeListenerStatus, 'cliAvailable'> = {
    state: 'stopped', forwardTo: null, startedAt: null, secretSaved: false, error: null,
  }
  private exitHook = () => { this.child?.kill('SIGTERM') }
  private hooked = false

  constructor(private options: { binary?: () => Promise<string | null>; timeoutMs?: number } = {}) {}

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.then(action, action)
    this.pending = next.catch(() => undefined)
    return next
  }

  async status(): Promise<StripeListenerStatus> {
    return { ...this.snapshot, cliAvailable: !!(await (this.options.binary ?? findStripeCli)()) }
  }

  start(apiKey: string, forwardTo: string): Promise<StripeListenerStatus> {
    return this.serial(async () => {
      if (!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(apiKey)) {
        throw new AppError('Ajoutez une clé Stripe de test sk_test_… Les clés réelles ne sont pas acceptées par ce bouton.', 400, 'TEST_KEY_REQUIRED')
      }
      const destination = new URL(forwardTo)
      if (destination.protocol !== 'http:' || destination.hostname !== '127.0.0.1' || destination.pathname !== '/api/webhooks/stripe' || destination.username || destination.password || destination.search || destination.hash) {
        throw new AppError('Le relais de test doit cibler le webhook local de l’application.', 400)
      }
      const fingerprint = createHash('sha256').update(apiKey).digest('hex')
      if (this.child) {
        if (this.snapshot.state === 'running' && this.fingerprint === fingerprint && this.snapshot.forwardTo === forwardTo) return this.status()
        throw new AppError('Arrêtez le relais actuel avant de changer de clé ou de le relancer.', 409)
      }
      const binary = await (this.options.binary ?? findStripeCli)()
      if (!binary) throw new AppError('Installez une fois le CLI Stripe sur votre Mac : brew install stripe/stripe-cli/stripe. Puis cliquez à nouveau sur démarrer.', 412, 'STRIPE_CLI_MISSING')
      this.snapshot = { state: 'starting', forwardTo, startedAt: null, secretSaved: false, error: null }
      this.fingerprint = fingerprint
      const child = spawn(binary, ['listen', '--skip-update', '--events', STRIPE_WEBHOOK_EVENTS.join(','), '--forward-to', forwardTo], {
        env: { ...process.env, STRIPE_API_KEY: apiKey, STRIPE_DEVICE_NAME: 'ProspectForge', NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'], shell: false,
      })
      this.child = child
      if (!this.hooked) { process.once('exit', this.exitHook); this.hooked = true }

      return new Promise<StripeListenerStatus>((resolve, reject) => {
        let settled = false
        let saving = false
        let buffer = ''
        let hint = 'Le relais Stripe s’est arrêté. Vérifiez votre connexion et votre clé de test, puis réessayez.'
        const fail = (message: string) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          this.snapshot = { ...this.snapshot, state: 'error', secretSaved: false, error: message }
          child.kill('SIGTERM')
          const force = setTimeout(() => { if (this.child === child) child.kill('SIGKILL') }, 2000)
          force.unref()
          reject(new AppError(message, 502, 'STRIPE_LISTENER_FAILED'))
        }
        const timer = setTimeout(() => fail('Stripe ne répond pas. Vérifiez votre connexion et la clé de test, puis relancez le relais.'), this.options.timeoutMs ?? 20000)
        const consume = (chunk: Buffer) => {
          if (settled) return
          // Bounded temporary parsing only: Stripe may split its secret across output chunks.
          buffer = (buffer + chunk.toString('utf8').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).slice(-8192)
          if (/invalid api key|expired api key|unauthorized|status.?401|authentication.*fail/i.test(buffer)) hint = 'La clé Stripe de test a été refusée. Vérifiez-la dans votre tableau de bord Stripe.'
          if (/permission|forbidden|status.?403/i.test(buffer)) hint = 'Cette clé de test n’a pas les autorisations nécessaires. Utilisez une clé secrète de test autorisée pour le CLI Stripe.'
          // Wait for the complete token, not a partial whsec_ prefix at the end of a chunk.
          const match = buffer.match(/\b(whsec_[A-Za-z0-9_]{16,200})(?=[\s\]"'.,]|$)/)
          if (!match || saving || settled) return
          // The CLI prints a line ending after the secret. A chunk ending mid-token is not ready.
          if (match.index! + match[1]!.length === buffer.length) return
          saving = true
          const secret = match[1]!
          buffer = ''
          void saveTestKeys(apiKey, secret).then(async () => {
            if (settled || this.child !== child || child.exitCode !== null) return
            settled = true
            clearTimeout(timer)
            this.snapshot = { ...this.snapshot, state: 'running', startedAt: new Date().toISOString(), secretSaved: true, error: null }
            resolve(await this.status())
          }).catch(() => fail('Le secret Stripe n’a pas pu être enregistré. Le relais a été arrêté ; réessayez.'))
        }
        child.stdout?.on('data', consume)
        child.stderr?.on('data', consume)
        child.once('error', () => fail('Impossible de lancer le CLI Stripe. Vérifiez son installation puis réessayez.'))
        child.once('close', () => {
          clearTimeout(timer)
          if (!settled) fail(hint)
          if (this.child !== child) return
          this.child = null
          this.fingerprint = ''
          if (this.snapshot.state === 'stopping') this.snapshot = { ...this.snapshot, state: 'stopped', error: null }
          else if (this.snapshot.state === 'running') this.snapshot = { ...this.snapshot, state: 'error', error: 'Le relais Stripe a été interrompu. Cliquez sur démarrer pour le relancer.' }
        })
      })
    })
  }

  stop(): Promise<StripeListenerStatus> {
    return this.serial(async () => {
      const child = this.child
      if (child) {
        this.snapshot = { ...this.snapshot, state: 'stopping' }
        await new Promise<void>((resolve, reject) => {
          let force: NodeJS.Timeout
          const timeout = setTimeout(() => { clearTimeout(force); reject(new AppError('Le processus Stripe ne s’est pas arrêté. Fermez le lanceur de l’application puis réessayez.', 503)) }, 4000)
          child.once('close', () => { clearTimeout(force); clearTimeout(timeout); resolve() })
          child.kill('SIGTERM')
          force = setTimeout(() => child.kill('SIGKILL'), 2000)
        })
      }
      this.snapshot = { state: 'stopped', forwardTo: null, startedAt: null, secretSaved: false, error: null }
      return this.status()
    })
  }
}

// Persist ownership across Next development reloads. Never detach a background daemon.
const globalListener = globalThis as typeof globalThis & { prospectForgeStripeTestListener?: StripeTestListener }
export function stripeTestListener(): StripeTestListener {
  return globalListener.prospectForgeStripeTestListener ??= new StripeTestListener()
}
