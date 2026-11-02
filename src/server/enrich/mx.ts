import { promises as dns } from 'node:dns'

let resolverHealthy: { ok: boolean; at: number } | null = null

/** Is DNS resolution available at all? (avoids marking every email invalid when offline) */
async function dnsAvailable(): Promise<boolean> {
  if (resolverHealthy && Date.now() - resolverHealthy.at < 10 * 60_000) return resolverHealthy.ok
  let ok = false
  try {
    ok = (await dns.resolveMx('gmail.com')).length > 0
  } catch {
    ok = false
  }
  resolverHealthy = { ok, at: Date.now() }
  return ok
}

/**
 * MX check: true = domain accepts mail, false = domain has no mail server, null = unknown (DNS unavailable).
 * A valid MX does NOT prove the mailbox exists.
 */
export async function checkMx(domain: string): Promise<boolean | null> {
  if (!(await dnsAvailable())) return null
  try {
    const mx = await dns.resolveMx(domain)
    if (mx.length) return true
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code !== 'ENODATA' && code !== 'ENOTFOUND') return null
  }
  // RFC 5321 implicit MX: an A record also accepts mail
  try {
    return (await dns.resolve4(domain)).length > 0
  } catch {
    return false
  }
}
