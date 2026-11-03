import {billingSetup} from '../billing/stripe'
import { sql } from '../core/db'
import { env } from '../core/env'
import { getSettings } from '../core/settings'
import { aiAvailability, generateStructured } from '../ai/client'
import { loadBusinessFacts } from '../sites/facts'
import { buildDeterministicProposal, findProspectClaim, PROPOSAL_SYSTEM_PROMPT, proposalContentSchema, EMAIL_VARIANTS, type ProposalContent, type ProposalFacts } from './content'

export function previewUrl(token: string, base?: string): string {
  return `${(base || env().APP_BASE_URL).replace(/\/$/, '')}/preview/${token}`
}

export function formatPrice(cents: number | null, currency: string): string | null {
  if (cents === null) return null
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
}

export async function loadProposalFacts(businessId: string, websiteId?: string | null, offerId?: string | null): Promise<ProposalFacts> {
  const db = sql()
  const settings = await getSettings()
  const f = await loadBusinessFacts(businessId)
  const [site] = websiteId
    ? await db<{ preview_token: string; preview_enabled: boolean }[]>`select preview_token, preview_enabled from generated_websites where id = ${websiteId} and business_id = ${businessId} and deleted_at is null and status='READY' and preview_enabled and (preview_expires_at is null or preview_expires_at>now())`
    : await db<{ preview_token: string; preview_enabled: boolean }[]>`select preview_token, preview_enabled from generated_websites where business_id = ${businessId} and deleted_at is null and status = 'READY' and preview_enabled and (preview_expires_at is null or preview_expires_at>now()) order by created_at desc limit 1`
  const [offer] = offerId
    ? await db<{ name: string; description: string; price_cents: number | null; currency: string }[]>`select name, description, price_cents, currency from sales_offers where id = ${offerId}`
    : await db<{ name: string; description: string; price_cents: number | null; currency: string }[]>`select name, description, price_cents, currency from sales_offers where active order by created_at limit 1`
  const billing=await billingSetup()
  return {
    businessName: f.name,
    sectorLabel: f.sectorLabel,
    city: f.city,
    websiteStatus: f.websiteStatus,
    websiteUrl: f.websiteUrl,
    auditFindings: f.auditFindings,
    demoUrl: site?.preview_enabled ? previewUrl(site.preview_token, settings.sites.previewBaseUrl) : null,
    offer: billing.ready ? {name:billing.commerce.title,description:'Création du site présenté en démonstration',price:formatPrice(billing.commerce.priceCents,billing.commerce.currency.toUpperCase())} : offer ? { name: offer.name, description: offer.description, price: formatPrice(offer.price_cents, offer.currency) } : null,
    senderName: settings.outreach.senderName || 'Votre prénom',
    signature: settings.outreach.signature,
  }
}

export async function generateProposal(input: { businessId: string; websiteId?: string | null; offerId?: string | null; strategyId?: string | null; generator?: 'auto' | 'ai' | 'deterministic'; jobId?: string | null }) {
  const db = sql()
  const facts = await loadProposalFacts(input.businessId, input.websiteId, input.offerId)
  const [strategy] = input.strategyId
    ? await db<{ id: string; instructions: string; tone: string }[]>`select id, instructions, tone from prompt_strategies where id = ${input.strategyId}`
    : await db<{ id: string; instructions: string; tone: string }[]>`select id, instructions, tone from prompt_strategies order by is_default desc, created_at limit 1`
  const fallback = buildDeterministicProposal(facts)
  const settings = await getSettings()
  const avail = await aiAvailability()
  const useAi = input.generator === 'ai' || ((input.generator ?? 'auto') === 'auto' && avail.available && settings.ai.costMode !== 'LOW_COST')
  let content: ProposalContent = fallback
  let generator = 'deterministic'
  let model: string | null = null
  let cost = 0
  const rejected: string[] = []
  if (useAi) {
    const r = await generateStructured({
      task: 'proposal',
      system: PROPOSAL_SYSTEM_PROMPT,
      instructions: `Rédige les 8 variantes d'emails (initial, short, direct, personalized, followup1, followup2, objection, meeting) et 3 objets alternatifs (subjects).
Stratégie commerciale : ${strategy?.instructions ?? 'Présenter la démonstration et proposer un échange.'} Ton : ${strategy?.tone ?? 'professionnel'}.
Faits vérifiés (seules informations utilisables) : ${JSON.stringify(facts)}`,
      schema: proposalContentSchema,
      businessId: input.businessId,
      jobId: input.jobId,
    })
    content = structuredClone(r.data)
    // per-variant guard: a variant with a fabricated claim, or missing the demo link, falls back
    for (const v of EMAIL_VARIANTS) {
      const bad = findProspectClaim(`${content[v].subject} ${content[v].body}`)
      const missingDemo = facts.demoUrl && ['initial', 'personalized'].includes(v) && !content[v].body.includes(facts.demoUrl)
      if (bad || missingDemo || !content[v].body.trim()) {
        rejected.push(`${v}: ${bad ? `affirmation « ${bad} »` : missingDemo ? 'lien de démonstration absent' : 'vide'}`)
        content[v] = fallback[v]
      }
    }
    generator = `ai:${r.provider}`
    model = r.model
    cost = r.costUsd
  }
  const billing=await billingSetup()
  if(billing.ready&&facts.demoUrl){const token=facts.demoUrl.split('/').pop()!;const link=previewUrl(token,billing.base).replace('/preview/','/buy/');const line=`Si vous souhaitez commander ce site : ${formatPrice(billing.commerce.priceCents,billing.commerce.currency.toUpperCase())}. Paiement sécurisé et facture : ${link}`;for(const key of EMAIL_VARIANTS){content[key].body+='\n\n'+line}}
  const [row] = await db<{ id: string }[]>`insert into proposals (business_id, website_id, offer_id, strategy_id, content, facts, generator, model, cost_usd)
    values (${input.businessId}, ${input.websiteId ?? null}, ${input.offerId ?? null}, ${strategy?.id ?? null}, ${db.json({ ...content, rejected } as never)}, ${db.json(facts as never)}, ${generator}, ${model}, ${cost})
    returning id`
  return { proposalId: row!.id, content, generator, model, costUsd: cost, rejected }
}
