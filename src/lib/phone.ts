import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return ''
  const p = parsePhoneNumberFromString(e164)
  return p ? p.formatNational() : e164
}
