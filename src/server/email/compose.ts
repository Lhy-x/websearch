import { env } from '../core/env'
import { getSettings } from '../core/settings'

export function unsubscribeUrl(token: string): string {
  return `${env().APP_BASE_URL.replace(/\/$/, '')}/u/${token}`
}

/** Footer required for B2B prospecting: sender identity + a working opt-out. */
export async function withComplianceFooter(body: string, unsubscribeToken: string): Promise<string> {
  const s = await getSettings()
  const legal = [s.outreach.companyLegalLine, s.outreach.physicalAddress].filter(Boolean).join(' – ')
  return `${body.trim()}\n\n--\n${legal ? legal + '\n' : ''}Vous ne souhaitez plus recevoir de message de ma part ? ${unsubscribeUrl(unsubscribeToken)}`
}

export function messageIdFor(id: string, fromEmail: string): string {
  const domain = fromEmail.split('@')[1] || 'prospectforge.local'
  return `<${id}@${domain}>`
}

/** Render {{placeholders}} from a fixed allow-list. */
export function renderTemplate(tpl: string, vars: Record<string, string | null | undefined>): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '')
}
