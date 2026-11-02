import { z } from 'zod'
import { sql } from '../core/db'
import { getSettings } from '../core/settings'
import { enqueueJob } from '../jobs/queue'
import { searchParamsSchema } from '../search/params'
import { listBusinesses } from '../business/queries'
import { createCampaign, addProspects } from '../campaigns/service'
import { campaignStats } from '../campaigns/queries'
import { estimateCost } from '../ai/estimate'
import { SECTORS } from '@/lib/sectors'

/**
 * Assistant tools = thin, validated wrappers around the real backend functions.
 * `read` tools run immediately. `action` tools (cost money, create data, queue work) return a preview
 * first and only run after the admin confirms. Nothing here sends an email or activates a campaign:
 * those stay explicit actions in their own screens.
 */
const sectorIds = SECTORS.map((s) => s.id) as [string, ...string[]]
const websiteFilter = z.enum(['any', 'no_website', 'no_website_confirmed', 'has_website', 'website_issues'])

export interface ToolResult {
  summary: string
  rows?: Record<string, unknown>[]
  links?: { label: string; href: string }[]
}

interface ToolDef<S extends z.ZodType> {
  name: string
  kind: 'read' | 'action'
  description: string
  schema: S
  /** action tools: describe exactly what will happen (no side effect) */
  preview?: (input: z.infer<S>) => Promise<ToolResult>
  run: (input: z.infer<S>) => Promise<ToolResult>
}

const def = <S extends z.ZodType>(d: ToolDef<S>) => d

const prospectSelector = z.object({
  businessIds: z.array(z.string().uuid()).max(200).optional().describe('Identifiants explicites (prioritaires)'),
  top: z.number().int().min(1).max(50).optional().describe('Nombre de meilleurs prospects à retenir'),
  city: z.string().max(100).optional(),
  sector: z.enum(sectorIds).optional(),
  websiteFilter: websiteFilter.optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  requireEmail: z.boolean().optional(),
  withoutSite: z.boolean().optional().describe('Exclure ceux qui ont déjà une démo générée'),
})
type Selector = z.infer<typeof prospectSelector>

async function resolveProspects(s: Selector): Promise<{ id: string; name: string; city: string | null; score: number | null }[]> {
  const db = sql()
  if (s.businessIds?.length)
    return db`select id, name, city, score from businesses where id = any(${s.businessIds}::uuid[]) and merged_into is null
      and (${!s.requireEmail} or (email is not null and email_status <> 'INVALID')) and not do_not_contact order by score desc nulls last`
  const { rows } = await listBusinesses({
    city: s.city, sector: s.sector, websiteFilter: s.websiteFilter ?? 'any', minScore: s.minScore, requireEmail: s.requireEmail ? 'true' : undefined,
    excludeContacted: 'true', archived: 'false', sort: 'score', dir: 'desc', page: 1, pageSize: Math.min(200, (s.top ?? 5) * (s.withoutSite ? 4 : 1)),
  })
  const filtered = s.withoutSite ? rows.filter((r) => r.sites === 0) : rows
  return filtered.slice(0, s.top ?? 5).map((r) => ({ id: r.id, name: r.name, city: r.city, score: r.score }))
}

export const TOOLS = [
  def({
    name: 'search_prospects',
    kind: 'action',
    description: 'Lance une recherche réelle d’établissements (sources configurées) autour d’une ville. Exécutée par le worker.',
    schema: z.object({
      city: z.string().min(1).max(100),
      country: z.enum(['FR', 'BE', 'CH']).default('FR'),
      sector: z.enum(sectorIds).optional(),
      keywords: z.string().max(200).optional(),
      radiusKm: z.number().min(1).max(100).default(10),
      websiteFilter: websiteFilter.default('no_website'),
    }),
    async preview(i) {
      const s = await getSettings()
      const sources = Object.entries(s.search.sources).filter(([, v]) => v).map(([k]) => k)
      return { summary: `Recherche « ${i.sector ? SECTORS.find((x) => x.id === i.sector)?.label : i.keywords ?? 'tous secteurs'} » à ${i.city} (${i.country}), rayon ${i.radiusKm} km, filtre ${i.websiteFilter}. Sources : ${sources.join(', ') || 'aucune activée'}.` }
    },
    async run(i) {
      const params = searchParamsSchema.parse({ ...i, maxResults: (await getSettings()).search.maxResults })
      const db = sql()
      const [run] = await db<{ id: string }[]>`insert into search_runs (params) values (${db.json(params as never)}) returning id`
      const { job } = await enqueueJob('search.run', { runId: run!.id, params }, { priority: 50, maxAttempts: 2 })
      await db`update search_runs set job_id = ${job.id} where id = ${run!.id}`
      return { summary: 'Recherche lancée par le worker.', links: [{ label: 'Suivre la recherche', href: `/search?run=${run!.id}` }] }
    },
  }),
  def({
    name: 'list_prospects',
    kind: 'read',
    description: 'Liste les prospects de la base selon des filtres (ville, secteur, présence web, score, email).',
    schema: prospectSelector,
    async run(i) {
      const rows = await resolveProspects({ ...i, top: i.top ?? 20 })
      return { summary: `${rows.length} prospect(s).`, rows: rows.map((r) => ({ id: r.id, Nom: r.name, Ville: r.city, Score: r.score })) }
    },
  }),
  def({
    name: 'generate_sites',
    kind: 'action',
    description: 'Génère une démonstration de site pour des prospects (les meilleurs selon des filtres, ou une liste d’identifiants).',
    schema: prospectSelector.extend({ style: z.string().max(30).optional() }),
    async preview(i) {
      const rows = await resolveProspects({ ...i, withoutSite: i.withoutSite ?? true })
      const est = await estimateCost('site_generation', Math.max(1, rows.length))
      return { summary: `${rows.length} site(s) seront générés. ${est.ai ? `Coût IA estimé : ${est.totalUsd != null ? est.totalUsd.toFixed(2) + ' $' : 'inconnu'}.` : est.note}`, rows: rows.map((r) => ({ id: r.id, Nom: r.name, Ville: r.city, Score: r.score })) }
    },
    async run(i) {
      const rows = await resolveProspects({ ...i, withoutSite: i.withoutSite ?? true })
      for (const r of rows) await enqueueJob('website.generate', { businessId: r.id, style: i.style ?? null }, { priority: 40 })
      return { summary: `${rows.length} génération(s) en file d’attente.`, links: [{ label: 'Voir le générateur', href: '/generator' }] }
    },
  }),
  def({
    name: 'prepare_campaign',
    kind: 'action',
    description: 'Crée une campagne en BROUILLON (mode manuel par défaut) et y ajoute des prospects. N’active rien et n’envoie aucun email.',
    schema: prospectSelector.extend({ name: z.string().min(1).max(120).optional(), mode: z.enum(['MANUAL', 'SEMI_AUTO']).default('MANUAL') }),
    async preview(i) {
      const rows = await resolveProspects({ ...i, requireEmail: true })
      return { summary: `Campagne « ${i.name ?? 'Campagne assistant'} » (${i.mode}, brouillon) avec ${rows.length} prospect(s) ayant un email. Aucun envoi avant activation et validation de votre part.`, rows: rows.map((r) => ({ id: r.id, Nom: r.name, Ville: r.city, Score: r.score })) }
    },
    async run(i) {
      const rows = await resolveProspects({ ...i, requireEmail: true })
      const id = await createCampaign({ name: i.name ?? `Campagne assistant ${new Date().toLocaleDateString('fr-FR')}`, mode: i.mode })
      const r = await addProspects(id, rows.map((x) => x.id))
      return { summary: `Campagne créée en brouillon : ${r.added} prospect(s) ajouté(s), ${r.skipped.length} ignoré(s).`, links: [{ label: 'Ouvrir la campagne', href: `/campaigns/${id}` }] }
    },
  }),
  def({
    name: 'campaign_performance',
    kind: 'read',
    description: 'Classe les campagnes par taux de réponse (prospects ayant répondu / prospects contactés).',
    schema: z.object({ limit: z.number().int().min(1).max(20).default(10) }),
    async run(i) {
      const rows = (await campaignStats())
        .map((c) => ({ id: c.id, Campagne: c.name, Statut: c.status, Contactés: c.sent_prospects, Réponses: c.replied_prospects, 'Taux de réponse': c.sent_prospects ? `${((100 * c.replied_prospects) / c.sent_prospects).toFixed(1)} %` : '—', Positives: c.positive, _rate: c.sent_prospects ? c.replied_prospects / c.sent_prospects : -1 }))
        .sort((a, b) => b._rate - a._rate)
        .slice(0, i.limit)
        .map(({ _rate, ...r }) => r)
      return { summary: rows.length ? 'Campagnes classées par taux de réponse (dénominateur : prospects contactés).' : 'Aucune campagne.', rows, links: rows.map((r) => ({ label: String(r.Campagne), href: `/campaigns/${r.id}` })) }
    },
  }),
  def({
    name: 'conversations_needing_attention',
    kind: 'read',
    description: 'Liste les conversations qui demandent une action (réponses non traitées).',
    schema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
    async run(i) {
      const rows = await sql()<{ id: string; name: string | null; last_classification: string | null; last_message_at: Date; summary: string | null }[]>`
        select c.id, b.name, c.last_classification, c.last_message_at,
          (select coalesce(summary, left(body_text, 140)) from inbound_messages i where i.conversation_id = c.id order by received_at desc limit 1) summary
        from conversations c left join businesses b on b.id = c.business_id where c.status = 'NEEDS_ATTENTION' order by c.last_message_at desc limit ${i.limit}`
      return { summary: `${rows.length} conversation(s) à traiter.`, rows: rows.map((r) => ({ id: r.id, Prospect: r.name ?? 'inconnu', Intention: r.last_classification, Reçu: r.last_message_at.toLocaleString('fr-FR'), Extrait: r.summary })), links: rows.map((r) => ({ label: r.name ?? 'Conversation', href: `/inbox?c=${r.id}` })) }
    },
  }),
  def({
    name: 'pipeline_summary',
    kind: 'read',
    description: 'Résumé du pipeline commercial (nombre de prospects par statut).',
    schema: z.object({}),
    async run() {
      const rows = await sql()<{ status: string; n: number }[]>`select pipeline_status status, count(*)::int n from businesses where merged_into is null and archived_at is null group by 1 order by 2 desc`
      return { summary: 'Prospects par statut.', rows: rows.map((r) => ({ Statut: r.status, Prospects: r.n })) }
    },
  }),
] as const

export type ToolName = (typeof TOOLS)[number]['name']
export const TOOL_BY_NAME = new Map<string, ToolDef<z.ZodType>>(TOOLS.map((t) => [t.name, t as unknown as ToolDef<z.ZodType>]))
