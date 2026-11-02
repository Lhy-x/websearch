import { SECTORS } from '@/lib/sectors'
import { stripAccents } from '../core/normalize'

/**
 * Deterministic French command parser — used when no AI provider is configured (or in LOW_COST mode).
 * Produces the same tool calls as the AI planner; never answers from imagination.
 */
export interface PlannedCall {
  tool: string
  input: Record<string, unknown>
}

const SYNONYMS: [RegExp, string][] = [
  [/barbier|barber/, 'barber'],
  [/coiff/, 'hair_salon'],
  [/institut|esthetic|beaute|ongle|onglerie/, 'beauty_salon'],
  [/restauration rapide|fast[- ]?food|kebab|snack/, 'fast_food'],
  [/restaurant|brasserie|bistro|pizzeria|creperie/, 'restaurant'],
  [/cafe|salon de the|\bbar\b/, 'cafe'],
  [/boulang|patiss/, 'bakery'],
  [/plomb|chauffagiste/, 'plumber'],
  [/electric/, 'electrician'],
  [/garage|mecani|carrosserie/, 'garage'],
  [/nettoyage|menage|proprete/, 'cleaning'],
  [/immobili/, 'real_estate'],
  [/architect/, 'architect'],
  [/conseil|consultant/, 'consulting'],
  [/photograph/, 'photographer'],
  [/artisan|menuisier|peintre|macon|couvreur|carreleur|serrurier|paysagiste/, 'artisan'],
  [/fleuris/, 'florist'],
  [/boucher|traiteur|charcut/, 'butcher'],
]

const NUM: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15, vingt: 20 }

export function detectSector(text: string): string | undefined {
  const t = stripAccents(text.toLowerCase())
  for (const [re, id] of SYNONYMS) if (re.test(t) && SECTORS.some((s) => s.id === id)) return id
  return undefined
}

export function detectCity(text: string): string | undefined {
  const m = text.match(/(?:^|\s)(?:à|a|autour de|près de|pres de|sur|vers)\s+((?:[A-ZÉÈÀÂÎÔÛ][\p{L}'’-]+)(?:[\s-](?:sur|en|le|la|les|de|du|des|lès|[A-ZÉÈÀÂÎÔÛ][\p{L}'’-]+))*)/u)
  if (!m) return undefined
  return m[1]!.replace(/\s+(?:sans|avec|dans|de|du|des|en)$/i, '').trim()
}

const WORDS = Object.keys(NUM).join('|')
const toNum = (w: string) => (/^\d+$/.test(w) ? Number(w) : NUM[w])

/** Quantity of prospects asked for — never the article « une » of « une démonstration ». */
export function detectNumber(text: string, fallback?: number): number | undefined {
  const t = stripAccents(text.toLowerCase())
  const near = t.match(new RegExp(`\\b(\\d{1,3}|${WORDS})\\s+(?:premiers?|meilleurs?|prospects?|entreprises?|commerces?|etablissements?)\\b`))
  if (near) return toNum(near[1]!)
  const after = t.match(new RegExp(`\\b(?:les|des|top)\\s+(\\d{1,3}|${WORDS})\\b`))
  if (after) return toNum(after[1]!)
  const d = t.match(/\b(\d{1,3})\b(?!\s*km)/)
  if (d) return Number(d[1])
  return fallback
}

export function detectRadius(text: string): number | undefined {
  const m = text.match(/(\d{1,3})\s*km/i)
  return m ? Number(m[1]) : undefined
}

function websiteFilterOf(t: string): string | undefined {
  if (/sans site (web )?confirm/.test(t) || /absence (de site )?confirm/.test(t)) return 'no_website_confirmed'
  if (/sans site|pas de site|aucun site/.test(t)) return 'no_website'
  if (/site (obsolete|casse|defaillant|de mauvaise qualite)|mauvais site|site avec (des )?defauts/.test(t)) return 'website_issues'
  return undefined
}

/** Parse one command; `selection` = prospects currently selected in the UI ("ces prospects"). */
export function parseCommand(raw: string, selection: string[] = []): PlannedCall[] {
  const t = stripAccents(raw.toLowerCase())
  const sector = detectSector(raw)
  const city = detectCity(raw)
  const wf = websiteFilterOf(t)
  const these = /\b(ces|les selectionnes|la selection|selectionnes)\b/.test(t) && selection.length ? { businessIds: selection } : {}

  if (/campagne/.test(t) && /(meilleur|taux|performan|classe|compar|resultat)/.test(t)) return [{ tool: 'campaign_performance', input: {} }]
  if (/(conversation|reponse|message|inbox|boite)/.test(t) && /(attention|traiter|repondre|en attente|urgent|necessit)/.test(t)) return [{ tool: 'conversations_needing_attention', input: {} }]
  if (/pipeline|par statut|entonnoir/.test(t)) return [{ tool: 'pipeline_summary', input: {} }]
  if (/(prepare|cree|creer|lance|monte).*campagne|campagne pour/.test(t))
    return [{ tool: 'prepare_campaign', input: { ...these, ...(these.businessIds ? {} : { top: detectNumber(raw, 20), city, sector, websiteFilter: wf }) } }]
  if (/(genere|generer|cree|creer|fais|produis).*(site|demo|demonstration|maquette)/.test(t))
    return [{ tool: 'generate_sites', input: { ...these, ...(these.businessIds ? {} : { top: detectNumber(raw, 5), city, sector, websiteFilter: wf }) } }]
  if (/(recherche|cherche|trouve|trouver|identifie|scanne)/.test(t) && city)
    return [{ tool: 'search_prospects', input: { city, sector, radiusKm: detectRadius(raw) ?? 10, websiteFilter: wf ?? 'any', keywords: sector ? undefined : undefined } }]
  if (/(liste|montre|affiche|quels|quelles|meilleurs|top)/.test(t) && /(prospect|entreprise|commerce|etablissement|salon|garage|restaurant|artisan)/.test(t))
    return [{ tool: 'list_prospects', input: { ...these, ...(these.businessIds ? {} : { top: detectNumber(raw, 20), city, sector, websiteFilter: wf }) } }]
  return []
}
