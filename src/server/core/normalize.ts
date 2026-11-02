import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

const LEGAL_FORMS = /\b(sarl|sas|sasu|eurl|sa|sci|snc|selarl|ei|eirl|scop|sprl|srl|bv|bvba|gmbh|ag|sàrl|sarlu|ets|etablissements?)\b/g

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Lowercase, accent-free, legal forms & punctuation removed, collapsed spaces. */
export function normalizeName(name: string): string {
  return stripAccents(name.toLowerCase())
    .replace(/&/g, ' et ')
    .replace(/['’`]/g, ' ')
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** E.164 phone or null. Handles Overture's "33629536828" (missing +). */
export function normalizePhone(raw: string | null | undefined, country: string = 'FR'): string | null {
  if (!raw) return null
  let s = String(raw).trim()
  if (!s) return null
  const digits = s.replace(/[^\d+]/g, '')
  if (/^(33|32|41)\d{8,10}$/.test(digits)) s = '+' + digits
  const p = parsePhoneNumberFromString(s, country as CountryCode)
  if (!p || !p.isValid()) return null
  return p.number
}

export function formatPhoneNational(e164: string | null | undefined): string | null {
  if (!e164) return null
  const p = parsePhoneNumberFromString(e164)
  return p ? p.formatNational() : e164
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0]!
  if (s.length > 254 || !EMAIL_RE.test(s)) return null
  const tld = s.split('.').pop()!
  if (!/^[a-z]{2,24}$/.test(tld)) return null
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(s)) return null
  return s
}

const ROLE_LOCALS = new Set(['contact', 'info', 'infos', 'bonjour', 'hello', 'accueil', 'reservation', 'reservations', 'rdv', 'commande', 'commandes', 'admin', 'secretariat', 'office', 'mail', 'sales', 'devis', 'agence', 'atelier', 'salon', 'boutique', 'shop'])
export function isRoleEmail(email: string): boolean {
  const local = email.split('@')[0] ?? ''
  return ROLE_LOCALS.has(local)
}

const FREE_MAIL = new Set(['gmail.com', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.fr', 'live.com', 'yahoo.fr', 'yahoo.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'icloud.com', 'gmx.fr', 'neuf.fr', 'bbox.fr', 'skynet.be', 'bluewin.ch', 'proton.me', 'protonmail.com'])
export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL.has(domain.toLowerCase())
}

export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s
  try {
    const u = new URL(s)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    if (!u.hostname.includes('.')) return null
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}

export function domainOf(url: string | null | undefined): string | null {
  const n = normalizeUrl(url)
  if (!n) return null
  return new URL(n).hostname.toLowerCase().replace(/^www\./, '')
}

/**
 * Hosts that are NOT the business' own website (directories, booking platforms, social networks).
 * A business whose only "website" is one of these has no own website.
 */
const THIRD_PARTY_HOSTS = [
  'facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com', 'pinterest.com',
  'planity.com', 'treatwell.fr', 'treatwell.com', 'treatwell.be', 'kiute.com', 'booksy.com', 'doctolib.fr', 'thefork.fr', 'lafourchette.com',
  'tripadvisor.fr', 'tripadvisor.com', 'pagesjaunes.fr', 'yelp.fr', 'yelp.com', 'google.com', 'goo.gl', 'g.page', 'business.site',
  'ubereats.com', 'deliveroo.fr', 'just-eat.fr', 'linktr.ee', 'societe.com', 'pappers.fr', 'mappy.com', 'houzz.fr', 'leboncoin.fr',
  'starofservice.com', 'habitatpresto.com', 'travaux.com', 'wix.com', 'site-solocal.com', 'solocal.com', 'local.ch', 'search.ch', 'goldenpages.be',
  'pagesdor.be', 'salonkee.be', 'salonkee.ch', 'uber.com', 'airbnb.fr', 'booking.com',
]
export function isThirdPartyHost(url: string | null | undefined): boolean {
  const d = domainOf(url)
  if (!d) return false
  return THIRD_PARTY_HOSTS.some((h) => d === h || d.endsWith('.' + h))
}

export function socialNetworkOf(url: string): string | null {
  const d = domainOf(url) ?? ''
  for (const n of ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'pinterest']) if (d.includes(n)) return n
  if (d === 'x.com' || d === 'twitter.com') return 'x'
  return null
}

export function slugify(s: string): string {
  return stripAccents(s.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
