import { sql } from '../core/db'
import { domainOf, isFreeMailDomain, isThirdPartyHost } from '../core/normalize'
import { safeFetch } from '../core/safe-fetch'
import { upsertContact } from '../business/contacts'
import { recomputeBusiness } from '../business/recompute'
import { extractPage, type PageExtract } from './html-extract'
import { checkMx } from './mx'
import type { PresenceEvidence } from './presence'
import { checkGooglePresence } from './google-presence'

export interface CrawlResult {
  url: string
  reachable: boolean
  status: number | null
  pages: number
  emailsFound: string[]
  socialsFound: string[]
  error?: string
}

/**
 * Crawl the business' OWN website (home + up to 3 contact/legal pages) to collect published
 * professional contacts. Emails published on the official site are recorded as SOURCE_CONFIRMED with
 * their source URL; others stay UNVERIFIED. No form is submitted, nothing intrusive is attempted.
 */
export async function crawlOfficialWebsite(businessId: string, url: string, opts: { allowPrivate?: boolean } = {}): Promise<CrawlResult> {
  const siteDomain = domainOf(url)
  const result: CrawlResult = { url, reachable: false, status: null, pages: 0, emailsFound: [], socialsFound: [] }
  let home: PageExtract
  let finalUrl = url
  try {
    const res = await safeFetch(url, { allowPrivate: opts.allowPrivate, timeoutMs: 15_000 })
    result.status = res.status
    finalUrl = res.url
    if (res.status >= 400 || !/html/i.test(res.headers['content-type'] ?? 'text/html')) {
      result.reachable = res.status < 400
      return result
    }
    result.reachable = true
    home = extractPage(res.body, res.url)
    result.pages = 1
  } catch (e) {
    result.error = (e as Error).message
    return result
  }
  const pages: [string, PageExtract][] = [[finalUrl, home]]
  for (const link of home.contactLinks.slice(0, 3)) {
    try {
      const r = await safeFetch(link, { allowPrivate: opts.allowPrivate, timeoutMs: 10_000 })
      if (r.status < 400) {
        pages.push([r.url, extractPage(r.body, r.url)])
        result.pages++
      }
    } catch {
      /* ignore secondary page failures */
    }
  }
  for (const [pageUrl, p] of pages) {
    for (const email of p.emails) {
      const d = email.split('@')[1]!
      const onOwnDomain = !!siteDomain && (d === siteDomain || d.endsWith('.' + siteDomain))
      await upsertContact(businessId, { kind: 'email', value: email, source: 'crawl', sourceUrl: pageUrl, status: onOwnDomain || isFreeMailDomain(d) ? 'SOURCE_CONFIRMED' : 'UNVERIFIED', confidence: onOwnDomain ? 0.9 : 0.6 })
      result.emailsFound.push(email)
    }
    for (const s of p.socials) {
      await upsertContact(businessId, { kind: 'social', value: s, source: 'crawl', sourceUrl: pageUrl })
      result.socialsFound.push(s)
    }
    for (const t of p.phones) await upsertContact(businessId, { kind: 'phone', value: t, source: 'crawl', sourceUrl: pageUrl, status: 'SOURCE_CONFIRMED' })
  }
  await sql()`insert into business_enrichments (business_id, field, value, source, source_url, confidence, verified_at)
    values (${businessId}, 'website_meta', ${sql().json({ title: home.title, description: home.metaDescription } as never)}, 'crawl', ${finalUrl}, 0.9, now())
    on conflict (business_id, field, source) do update set value = excluded.value, source_url = excluded.source_url, verified_at = now(), retrieved_at = now()`
  // text published by the business itself on its own site: real services, vocabulary, tone
  const text = pages.map(([u, p]) => `[${u}] ${p.mainText}`).join('\n').slice(0, 8000)
  if (text.trim())
    await sql()`insert into business_enrichments (business_id, field, value, source, source_url, confidence, verified_at)
      values (${businessId}, 'website_text', ${sql().json({ text, pages: pages.map(([u]) => u) } as never)}, 'crawl', ${finalUrl}, 0.9, now())
      on conflict (business_id, field, source) do update set value = excluded.value, source_url = excluded.source_url, verified_at = now(), retrieved_at = now()`
  return result
}

/** Verify syntax + MX of every email contact. Never claims a mailbox exists. */
export async function verifyEmails(businessId: string): Promise<{ checked: number; invalid: number; unknown: number }> {
  const db = sql()
  const emails = await db<{ id: string; normalized_value: string; status: string }[]>`
    select id, normalized_value, status from business_contacts where business_id = ${businessId} and kind = 'email' and status <> 'INVALID'`
  let invalid = 0
  let unknown = 0
  for (const e of emails) {
    const mx = await checkMx(e.normalized_value.split('@')[1]!)
    if (mx === null) unknown++
    if (mx === false) invalid++
    await db`update business_contacts set mx_valid = ${mx}, verified_at = ${mx === null ? null : new Date()},
               status = case when ${mx === false} then 'INVALID' else status end where id = ${e.id}`
  }
  return { checked: emails.length, invalid, unknown }
}

/**
 * Full enrichment of one business: crawl own website if any, verify emails, record a live
 * website-presence observation, recompute status & score.
 */
export async function enrichBusiness(businessId: string, opts: { allowPrivate?: boolean } = {}) {
  const db = sql()
  const [b] = await db<{ website_url: string | null }[]>`select website_url from businesses where id = ${businessId}`
  if (!b) throw new Error('Prospect introuvable')
  // 1) live check first: it may reveal a website the open data didn't list
  let googleEvidence: PresenceEvidence | null = null
  let googleError: string | null = null
  try {
    googleEvidence = await checkGooglePresence(businessId)
  } catch (e) {
    googleError = (e as Error).message
  }
  const websites = await db<{ normalized_value: string }[]>`
    select normalized_value from business_contacts where business_id = ${businessId} and kind = 'website' and status <> 'INVALID'`
  const own = websites.map((w) => w.normalized_value).filter((w) => !isThirdPartyHost(w))
  const crawls: CrawlResult[] = []
  for (const url of own.slice(0, 2)) {
    const r = await crawlOfficialWebsite(businessId, url, opts)
    crawls.push(r)
    if (!r.reachable) await db`update business_contacts set status = 'UNVERIFIED' where business_id = ${businessId} and kind = 'website' and normalized_value = ${url}`
  }
  const emails = await verifyEmails(businessId)
  const now = new Date().toISOString()
  // Only record observations that were actually made: "nothing to crawl" is not evidence of anything.
  const fresh: PresenceEvidence[] = []
  if (own.length) fresh.push({ source: 'crawl', at: now, live: true, finding: crawls.some((c) => c.reachable) ? 'website_listed' : 'no_website', detail: crawls.map((c) => `${c.url} → ${c.status ?? c.error}`).join('; ') })
  if (googleEvidence) fresh.push(googleEvidence)
  const replaced = fresh.map((e) => e.source)
  await db`update businesses set enriched_at = now(), web_presence_checked_at = now(),
             pipeline_status = case when pipeline_status in ('NEW','DISCOVERED') then 'ENRICHED' else pipeline_status end,
             web_presence_evidence = coalesce((select jsonb_agg(e) from jsonb_array_elements(web_presence_evidence) e
                                               where not (e->>'source' = any(${replaced})) and e->>'source' <> 'crawl'), '[]'::jsonb) || ${db.json(fresh as never)}
           where id = ${businessId}`
  const r = await recomputeBusiness(businessId)
  return { crawls, emails, google: googleEvidence ? googleEvidence.finding : googleError ? `erreur : ${googleError}` : 'non configuré ou non trouvé', presence: r?.presence, score: r?.score }
}
