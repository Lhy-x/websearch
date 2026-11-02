import { lookup as dnsLookup } from 'node:dns'
import { isIP } from 'node:net'
import { Agent, ProxyAgent, fetch as ufetch, type Dispatcher } from 'undici'
import { env } from './env'

/**
 * SSRF-hardened HTTP client for fetching UNTRUSTED urls (prospect websites, imported data):
 *  - only http/https, only ports 80/443 (+8080/8443)
 *  - hostnames resolved at connect time and every resolved IP checked (no DNS-rebinding window)
 *  - private, loopback, link-local, CGNAT, multicast & reserved ranges rejected
 *  - redirects followed manually (max 5) and re-validated
 *  - response size & time bounded
 */
export class BlockedUrlError extends Error {}

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443'])

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const p = ip.split('.').map(Number) as [number, number, number, number]
    const [a, b] = p
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224
    )
  }
  const v = ip.toLowerCase()
  if (v === '::' || v === '::1') return true
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7))
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith('64:ff9b') || v.startsWith('2001:db8')
}

export function assertSafeUrl(raw: string, opts: { allowPrivate?: boolean } = {}): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new BlockedUrlError(`URL invalide: ${raw}`)
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new BlockedUrlError(`Protocole interdit: ${u.protocol}`)
  if (u.username || u.password) throw new BlockedUrlError('Identifiants dans l’URL interdits')
  if (opts.allowPrivate) return u
  if (!ALLOWED_PORTS.has(u.port)) throw new BlockedUrlError(`Port interdit: ${u.port}`)
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    throw new BlockedUrlError(`Hôte interne interdit: ${host}`)
  if (isIP(host) && isPrivateIp(host)) throw new BlockedUrlError(`Adresse privée interdite: ${host}`)
  return u
}

function guardedLookup(hostname: string, options: object, cb: (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '')
    const list = addresses as { address: string; family: number }[]
    const bad = list.find((a) => isPrivateIp(a.address))
    if (bad) return cb(Object.assign(new BlockedUrlError(`${hostname} résout vers une adresse privée (${bad.address})`), { code: 'EBLOCKED' }), '')
    if ((options as { all?: boolean }).all) return cb(null, list)
    const first = list[0]!
    cb(null, first.address, first.family)
  })
}

let guardedAgent: Dispatcher | null = null
let plainAgent: Dispatcher | null = null
function dispatcher(allowPrivate: boolean): Dispatcher {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (proxy && !allowPrivate) {
    // Behind an egress proxy the proxy resolves DNS; literal/internal hosts are still rejected by assertSafeUrl.
    return (guardedAgent ??= new ProxyAgent({ uri: proxy }))
  }
  if (allowPrivate) return (plainAgent ??= new Agent({ connect: { timeout: 10_000 } }))
  return (guardedAgent ??= new Agent({ connect: { timeout: 10_000, lookup: guardedLookup as never } }))
}

export interface SafeResponse {
  url: string
  status: number
  headers: Record<string, string>
  body: string
  redirects: string[]
  elapsedMs: number
  truncated: boolean
}

export async function safeFetch(
  url: string,
  opts: { method?: 'GET' | 'HEAD'; timeoutMs?: number; maxBytes?: number; allowPrivate?: boolean; headers?: Record<string, string> } = {},
): Promise<SafeResponse> {
  const started = Date.now()
  const redirects: string[] = []
  let current = assertSafeUrl(url, opts).toString()
  const maxBytes = opts.maxBytes ?? 2_000_000
  const contact = env().CRAWLER_CONTACT
  for (let hop = 0; hop <= 5; hop++) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15_000)
    try {
      const res = await ufetch(current, {
        method: opts.method ?? 'GET',
        redirect: 'manual',
        signal: ctl.signal,
        dispatcher: dispatcher(!!opts.allowPrivate),
        headers: {
          'user-agent': `ProspectForgeBot/0.1 (+audit de présence web${contact ? '; ' + contact : ''})`,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'accept-language': 'fr,en;q=0.7',
          ...opts.headers,
        },
      })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location')!, current).toString()
        redirects.push(next)
        current = assertSafeUrl(next, opts).toString()
        await res.body?.cancel()
        continue
      }
      let body = ''
      let truncated = false
      if (opts.method !== 'HEAD' && res.body) {
        const reader = res.body.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) {
            truncated = true
            await reader.cancel()
            break
          }
          chunks.push(value)
        }
        body = Buffer.concat(chunks).toString('utf8')
      }
      const headers: Record<string, string> = {}
      res.headers.forEach((v, k) => (headers[k] = v))
      return { url: current, status: res.status, headers, body, redirects, elapsedMs: Date.now() - started, truncated }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new BlockedUrlError('Trop de redirections')
}
