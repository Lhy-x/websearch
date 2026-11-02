import { adminRoute } from '@/server/http/route'
import { AppError } from '@/server/core/errors'
import { randomToken } from '@/server/core/crypto'
import { putObject } from '@/server/core/storage'
import { guessMapping, mapImportRows, MAX_IMPORT_BYTES, parseImportFile, IMPORT_FIELDS, type Mapping } from '@/server/connectors/import'

/** Upload + parse + full validation (dry run). Nothing is written to the prospect base here. */
export const POST = adminRoute(async ({ req }) => {
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new AppError('Fichier manquant', 400)
  if (file.size > MAX_IMPORT_BYTES) throw new AppError('Fichier trop volumineux (10 Mo max)', 413)
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (!['csv', 'json', 'xlsx', 'txt'].includes(ext)) throw new AppError('Format non supporté (CSV, JSON, XLSX)', 415)
  const buf = Buffer.from(await file.arrayBuffer())
  let parsed
  try {
    parsed = await parseImportFile(buf, file.name)
  } catch (e) {
    throw new AppError(`Fichier illisible : ${(e as Error).message}`, 400)
  }
  const mappingRaw = form.get('mapping')
  const mapping: Mapping = mappingRaw ? (JSON.parse(String(mappingRaw)) as Mapping) : guessMapping(parsed.columns)
  const country = String(form.get('country') ?? 'FR')
  const key = `imports/${randomToken(12)}.${ext}`
  await putObject(key, buf)
  const { places, errors } = mapImportRows(parsed.rows, mapping, { country })
  return { key, filename: file.name, columns: parsed.columns, fields: IMPORT_FIELDS, mapping, sample: parsed.rows.slice(0, 5), total: parsed.rows.length, valid: places.length, errors: errors.slice(0, 300), errorCount: errors.length }
})
