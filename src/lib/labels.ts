import type { Tone } from '@/components/ui/primitives'

export const PRESENCE: Record<string, { label: string; tone: Tone }> = {
  NO_WEBSITE_CONFIRMED: { label: 'Sans site (confirmé)', tone: 'success' },
  NO_WEBSITE_KNOWN: { label: 'Aucun site connu', tone: 'primary' },
  WEBSITE_BROKEN: { label: 'Site inaccessible', tone: 'danger' },
  WEBSITE_OUTDATED: { label: 'Site obsolète', tone: 'warning' },
  WEBSITE_LOW_QUALITY: { label: 'Site faible', tone: 'warning' },
  WEBSITE_FOUND: { label: 'Site trouvé', tone: 'neutral' },
  WEBSITE_GOOD: { label: 'Site correct', tone: 'neutral' },
  UNVERIFIED: { label: 'Non vérifié', tone: 'neutral' },
}

export const PIPELINE: { id: string; label: string; tone: Tone }[] = [
  { id: 'NEW', label: 'Nouveau', tone: 'neutral' },
  { id: 'DISCOVERED', label: 'Découvert', tone: 'neutral' },
  { id: 'ENRICHED', label: 'Enrichi', tone: 'info' },
  { id: 'QUALIFIED', label: 'Qualifié', tone: 'primary' },
  { id: 'WEBSITE_GENERATED', label: 'Démo créée', tone: 'primary' },
  { id: 'CONTACTED', label: 'Contacté', tone: 'info' },
  { id: 'REPLIED', label: 'A répondu', tone: 'warning' },
  { id: 'INTERESTED', label: 'Intéressé', tone: 'success' },
  { id: 'MEETING_BOOKED', label: 'RDV obtenu', tone: 'success' },
  { id: 'NEGOTIATION', label: 'Négociation', tone: 'warning' },
  { id: 'WON', label: 'Gagné', tone: 'success' },
  { id: 'LOST', label: 'Perdu', tone: 'danger' },
  { id: 'DO_NOT_CONTACT', label: 'Ne pas contacter', tone: 'danger' },
]
export const PIPELINE_BY_ID = Object.fromEntries(PIPELINE.map((p) => [p.id, p]))

export const EMAIL_STATUS: Record<string, { label: string; tone: Tone }> = {
  SOURCE_CONFIRMED: { label: 'Publié par une source', tone: 'success' },
  UNVERIFIED: { label: 'Non vérifié', tone: 'warning' },
  INVALID: { label: 'Invalide', tone: 'danger' },
  NONE: { label: 'Aucun email', tone: 'neutral' },
}

export const JOB_STATUS: Record<string, Tone> = { PENDING: 'neutral', RUNNING: 'info', COMPLETED: 'success', FAILED: 'danger', RETRYING: 'warning', CANCELLED: 'neutral' }

export const MSG_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Brouillon', tone: 'neutral' },
  AWAITING_APPROVAL: { label: 'À valider', tone: 'warning' },
  SCHEDULED: { label: 'Programmé', tone: 'info' },
  SENDING: { label: 'Envoi…', tone: 'info' },
  SENT: { label: 'Envoyé', tone: 'primary' },
  DELIVERED: { label: 'Délivré', tone: 'success' },
  BOUNCED: { label: 'Rejeté', tone: 'danger' },
  COMPLAINED: { label: 'Plainte', tone: 'danger' },
  FAILED: { label: 'Échec', tone: 'danger' },
  CANCELLED: { label: 'Annulé', tone: 'neutral' },
}

export const CLASSIFICATION: Record<string, { label: string; tone: Tone }> = {
  INTERESTED: { label: 'Intéressé', tone: 'success' },
  MEETING_REQUEST: { label: 'Demande de RDV', tone: 'success' },
  QUESTION: { label: 'Question', tone: 'info' },
  OBJECTION: { label: 'Objection', tone: 'warning' },
  NOT_INTERESTED: { label: 'Pas intéressé', tone: 'danger' },
  UNSUBSCRIBE: { label: 'Désinscription', tone: 'danger' },
  OUT_OF_OFFICE: { label: 'Absence', tone: 'neutral' },
  BOUNCE: { label: 'Rebond', tone: 'danger' },
  UNKNOWN: { label: 'Inconnu', tone: 'neutral' },
}
