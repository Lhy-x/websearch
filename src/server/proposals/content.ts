import { z } from 'zod'

export const EMAIL_VARIANTS = ['initial', 'short', 'direct', 'personalized', 'followup1', 'followup2', 'objection', 'meeting'] as const
export type EmailVariant = (typeof EMAIL_VARIANTS)[number]

export const VARIANT_LABELS: Record<EmailVariant, string> = {
  initial: 'Email initial', short: 'Variante courte', direct: 'Variante directe', personalized: 'Variante personnalisée',
  followup1: 'Première relance', followup2: 'Deuxième relance', objection: 'Réponse à une objection', meeting: 'Proposition de rendez-vous',
}

const mail = z.object({ subject: z.string(), body: z.string() })
export const proposalContentSchema = z.object({
  subjects: z.array(z.string()),
  initial: mail, short: mail, direct: mail, personalized: mail, followup1: mail, followup2: mail, objection: mail, meeting: mail,
})
export type ProposalContent = z.infer<typeof proposalContentSchema>

export interface ProposalFacts {
  businessName: string
  sectorLabel: string
  city: string | null
  websiteStatus: string
  websiteUrl: string | null
  auditFindings: string[]
  demoUrl: string | null
  offer: { name: string; description: string; price: string | null } | null
  senderName: string
  signature: string
}

/** Claims we must never make about the prospect (price of OUR offer is allowed). */
const PROSPECT_CLAIMS = [/\b(avis|étoiles|note de)\b/i, /\b\d+\s*(ans|années)\b/i, /\b(certifié|labellisé|primé)\b/i, /vos clients (nous )?(disent|trouvent)/i, /\bj'ai vu que vous avez\s+\d+/i]
export function findProspectClaim(text: string): string | null {
  for (const re of PROSPECT_CLAIMS) {
    const m = text.match(re)
    if (m) return m[0]
  }
  return null
}

function situation(f: ProposalFacts): string {
  switch (f.websiteStatus) {
    case 'NO_WEBSITE_CONFIRMED':
      return `je n'ai pas trouvé de site internet pour ${f.businessName}`
    case 'NO_WEBSITE_KNOWN':
      return `je n'ai pas trouvé de site internet propre à ${f.businessName} dans les annuaires que j'ai consultés`
    case 'WEBSITE_BROKEN':
      return `le site ${f.websiteUrl ?? ''} ne s'affichait pas correctement lors de ma visite`
    case 'WEBSITE_OUTDATED':
    case 'WEBSITE_LOW_QUALITY':
      return `en visitant votre site, j'ai relevé quelques points d'amélioration${f.auditFindings.length ? ` (${f.auditFindings.slice(0, 2).join(', ').toLowerCase()})` : ''}`
    default:
      return `je travaille avec des ${f.sectorLabel.toLowerCase()}s${f.city ? ' de la région de ' + f.city : ''}`
  }
}

/** Deterministic proposal from verified facts only (used without AI or as fallback). */
export function buildDeterministicProposal(f: ProposalFacts): ProposalContent {
  const sig = `\n\n${f.signature || f.senderName}`
  const demo = f.demoUrl ? `\n\nJ'ai préparé une démonstration, sans engagement, de ce que pourrait être votre site :\n${f.demoUrl}` : ''
  const offer = f.offer ? `\n\nCe que je propose : ${f.offer.name}${f.offer.price ? ` (${f.offer.price})` : ''}. ${f.offer.description}` : ''
  const hello = 'Bonjour,'
  const s = situation(f)
  return {
    subjects: [`${f.businessName} : une proposition de site`, `Votre présence en ligne${f.city ? ' à ' + f.city : ''}`, `Démonstration pour ${f.businessName}`],
    initial: { subject: `${f.businessName} : une proposition de site`, body: `${hello}\n\nEn cherchant des ${f.sectorLabel.toLowerCase()}s${f.city ? ' à ' + f.city : ''}, ${s}.${demo}${offer}\n\nSeriez-vous disponible pour en parler 15 minutes cette semaine ?${sig}` },
    short: { subject: `Démonstration pour ${f.businessName}`, body: `${hello}\n\n${capitalize(s)}. ${f.demoUrl ? `Voici une maquette réalisée pour vous : ${f.demoUrl}` : 'Je peux vous préparer une maquette.'}\n\nCela vous intéresse ?${sig}` },
    direct: { subject: `Un site pour ${f.businessName}`, body: `${hello}\n\nJe crée des sites pour les ${f.sectorLabel.toLowerCase()}s.${f.offer ? ` ${f.offer.name}${f.offer.price ? ', ' + f.offer.price : ''}.` : ''}${f.demoUrl ? `\nAperçu réalisé pour vous : ${f.demoUrl}` : ''}\n\nOn en parle ?${sig}` },
    personalized: { subject: `${f.businessName}${f.city ? ' – ' + f.city : ''}`, body: `${hello}\n\n${capitalize(s)}. Les clients cherchent de plus en plus leurs adresses en ligne, et un site clair avec vos coordonnées et vos prestations les aide à vous choisir.${demo}${offer}\n\nJe reste à votre disposition pour l'adapter à votre goût.${sig}` },
    followup1: { subject: `Re: ${f.businessName} : une proposition de site`, body: `${hello}\n\nJe me permets de revenir vers vous au sujet de mon précédent message.${f.demoUrl ? ` La démonstration est toujours consultable : ${f.demoUrl}` : ''}\n\nAvez-vous eu l'occasion d'y jeter un œil ?${sig}` },
    followup2: { subject: `Re: ${f.businessName}`, body: `${hello}\n\nDernier message de ma part sur ce sujet : si ce n'est pas le bon moment, aucun souci. Si vous souhaitez en reparler plus tard, il suffit de répondre à cet email.${sig}` },
    objection: { subject: `Re: ${f.businessName}`, body: `${hello}\n\nMerci pour votre retour. Je comprends tout à fait. Si la question du budget ou du temps se pose, je peux vous proposer une version simple, mise en ligne rapidement et que nous ferons évoluer ensuite.\n\nVoulez-vous que je vous envoie le détail ?${sig}` },
    meeting: { subject: `Rendez-vous – ${f.businessName}`, body: `${hello}\n\nAvec plaisir. Je vous propose un échange de 15 minutes par téléphone ou sur place. Quels créneaux vous conviendraient cette semaine ou la suivante ?${sig}` },
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const PROPOSAL_SYSTEM_PROMPT = `Tu rédiges des emails de prospection B2B en français pour un créateur de sites web indépendant.
Règles impératives :
- N'utilise que les faits fournis. N'invente jamais d'avis, de chiffres, de clients, de résultats, de promesses de résultats (trafic, chiffre d'affaires), ni de familiarité (« comme convenu », « suite à notre échange »).
- Pas de fausse preuve sociale, pas de pression artificielle (« offre limitée »).
- Messages naturels, courts (80 à 140 mots pour l'email initial, moins pour les variantes courtes et les relances), vouvoiement, sans emoji, sans markdown.
- Inclure le lien de démonstration s'il est fourni. Terminer par la signature fournie.
- Ne mentionne pas de lien de désinscription : il est ajouté automatiquement.`
