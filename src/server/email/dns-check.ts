import { promises as dns } from 'node:dns'

/** SPF / DMARC / DKIM (common selectors) presence check for the sending domain. Informational only. */
export async function checkDmarc(domain: string) {
  const d = domain.trim().toLowerCase().replace(/^.*@/, '')
  const txt = async (name: string) => {
    try {
      return (await dns.resolveTxt(name)).map((r) => r.join(''))
    } catch (e) {
      const code = (e as { code?: string }).code
      return code === 'ENODATA' || code === 'ENOTFOUND' ? [] : null
    }
  }
  const root = await txt(d)
  if (root === null) return { domain: d, available: false, message: 'Résolution DNS indisponible depuis ce serveur' }
  const spf = root.find((r) => r.toLowerCase().startsWith('v=spf1')) ?? null
  const dmarc = ((await txt(`_dmarc.${d}`)) ?? []).find((r) => r.toLowerCase().startsWith('v=dmarc1')) ?? null
  const dkim: string[] = []
  for (const sel of ['resend', 'default', 'google', 'selector1', 'selector2', 'k1', 's1', 'mail']) {
    const r = await txt(`${sel}._domainkey.${d}`)
    if (r?.some((x) => /v=dkim1|p=/i.test(x))) dkim.push(sel)
  }
  return { domain: d, available: true, spf, dmarc, dkimSelectors: dkim, ok: !!spf && !!dmarc && dkim.length > 0 }
}
