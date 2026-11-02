import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { normalizeEmail, normalizePhone, normalizeUrl } from '../core/normalize'
import { SECTORS, sectorFromNaf } from '@/lib/sectors'
import type { RawPlace } from './types'

export const IMPORT_FIELDS = ['name', 'sector', 'address', 'postcode', 'city', 'country', 'lat', 'lon', 'phone', 'email', 'website', 'siret', 'naf', 'external_id', 'tags'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]
export type Mapping = Partial<Record<ImportField, string>>

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_ROWS = 20000

export async function parseImportFile(buf: Buffer, filename: string): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  if (buf.byteLength > MAX_IMPORT_BYTES) throw new Error('Fichier trop volumineux (10 Mo maximum)')
  const ext = filename.toLowerCase().split('.').pop()
  let rows: Record<string, string>[] = []
  if (ext === 'csv' || ext === 'txt') {
    const text = buf.toString('utf8').replace(/^﻿/, '')
    const r = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, delimitersToGuess: [',', ';', '\t', '|'] })
    rows = r.data
  } else if (ext === 'json') {
    const data = JSON.parse(buf.toString('utf8')) as unknown
    const arr = Array.isArray(data) ? data : Array.isArray((data as { data?: unknown }).data) ? (data as { data: unknown[] }).data : null
    if (!arr) throw new Error('JSON attendu : un tableau d’objets')
    rows = arr.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)])))
  } else if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('Classeur vide')
    const header: string[] = []
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (header[i - 1] = String(c.text ?? '').trim() || `col${i}`))
    ws.eachRow((row, n) => {
      if (n === 1) return
      const o: Record<string, string> = {}
      header.forEach((h, i) => (o[h] = String(row.getCell(i + 1).text ?? '').trim()))
      if (Object.values(o).some(Boolean)) rows.push(o)
    })
  } else throw new Error('Format non supporté (CSV, JSON ou XLSX)')
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Trop de lignes (${rows.length} > ${MAX_IMPORT_ROWS})`)
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 100)
  return { columns, rows }
}

const GUESS: Record<ImportField, RegExp> = {
  name: /^(nom|name|raison|enseigne|denomination|établissement|etablissement|entreprise|company|business)/i,
  sector: /^(secteur|activit|categor|sector|type)/i,
  address: /^(adresse|address|rue|street)/i,
  postcode: /^(cp|code.?postal|postcode|zip|npa)/i,
  city: /^(ville|commune|city|localit)/i,
  country: /^(pays|country)/i,
  lat: /^(lat|latitude)$/i,
  lon: /^(lon|lng|long|longitude)$/i,
  phone: /^(t[ée]l|phone|mobile|portable)/i,
  email: /^(e-?mail|courriel|mail)/i,
  website: /^(site|web|url|website)/i,
  siret: /^siret/i,
  naf: /^(naf|ape|code.?naf)/i,
  external_id: /^(id|identifiant|ref)$/i,
  tags: /^(tags?|étiquettes?)$/i,
}
export function guessMapping(columns: string[]): Mapping {
  const m: Mapping = {}
  for (const f of IMPORT_FIELDS) {
    const c = columns.find((col) => GUESS[f].test(col.trim()))
    if (c) m[f] = c
  }
  return m
}

export interface RowError {
  line: number
  errors: string[]
}

const num = (s: string | undefined) => (s && s.trim() ? Number(s.replace(',', '.')) : null)

/** Validate & map rows. Line numbers are 1-based data rows (+1 for the header line in CSV/XLSX). */
export function mapImportRows(rows: Record<string, string>[], mapping: Mapping, defaults: { country: string }): { places: (RawPlace & { tags: string[] })[]; errors: RowError[] } {
  const places: (RawPlace & { tags: string[] })[] = []
  const errors: RowError[] = []
  const get = (r: Record<string, string>, f: ImportField) => (mapping[f] ? (r[mapping[f]!] ?? '').trim() : '')
  rows.forEach((r, i) => {
    const line = i + 2
    const errs: string[] = []
    const name = get(r, 'name')
    if (!name) errs.push('nom manquant')
    const lat = num(get(r, 'lat'))
    const lon = num(get(r, 'lon'))
    if ((lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) || (lon !== null && (Number.isNaN(lon) || lon < -180 || lon > 180))) errs.push('coordonnées invalides')
    const country = (get(r, 'country') || defaults.country).toUpperCase().slice(0, 2)
    const rawEmail = get(r, 'email')
    const email = rawEmail ? normalizeEmail(rawEmail) : null
    if (rawEmail && !email) errs.push(`email invalide « ${rawEmail.slice(0, 60)} »`)
    const rawPhone = get(r, 'phone')
    const phone = rawPhone ? normalizePhone(rawPhone, country) : null
    if (rawPhone && !phone) errs.push(`téléphone invalide « ${rawPhone.slice(0, 30)} »`)
    const rawWeb = get(r, 'website')
    const website = rawWeb ? normalizeUrl(rawWeb) : null
    if (rawWeb && !website) errs.push('site web invalide')
    const siret = get(r, 'siret').replace(/\s/g, '')
    if (siret && !/^\d{14}$/.test(siret)) errs.push('SIRET invalide (14 chiffres)')
    if (errs.length) {
      errors.push({ line, errors: errs })
      return
    }
    const sectorRaw = get(r, 'sector').toLowerCase()
    const sector = SECTORS.find((s) => s.id === sectorRaw || s.label.toLowerCase() === sectorRaw)?.id ?? sectorFromNaf(get(r, 'naf') || null, name) ?? null
    const externalId = get(r, 'external_id') || createHash('sha1').update([name, get(r, 'address'), get(r, 'postcode'), get(r, 'city')].join('|').toLowerCase()).digest('hex').slice(0, 20)
    places.push({
      source: 'import',
      sourceRecordId: externalId,
      license: 'Import utilisateur',
      name,
      sector,
      sourceCategory: get(r, 'sector') || null,
      address: get(r, 'address') || null,
      postcode: get(r, 'postcode') || null,
      city: get(r, 'city') || null,
      region: null,
      country,
      lat,
      lon,
      phones: phone ? [phone] : [],
      websites: website ? [website] : [],
      emails: email ? [email] : [],
      socials: [],
      siret: siret || null,
      siren: siret ? siret.slice(0, 9) : null,
      naf: get(r, 'naf') || null,
      confidence: 0.6,
      raw: { line },
      tags: get(r, 'tags').split(/[,|;]/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
    })
  })
  return { places, errors }
}

export const importCommitSchema = z.object({ key: z.string().regex(/^imports\/[A-Za-z0-9_-]+\.(csv|json|xlsx|txt)$/), filename: z.string().max(200), mapping: z.record(z.string(), z.string()), country: z.enum(['FR', 'BE', 'CH']).default('FR') })
