import { adminRoute } from '@/server/http/route'
import { getObject } from '@/server/core/storage'
import { AppError } from '@/server/core/errors'

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', zip: 'application/zip', json: 'application/json', gz: 'application/gzip' }

/** Private storage files (screenshots, exports) — admin only. */
export const GET = adminRoute(async ({ params }) => {
  const key = (params.key as unknown as string[]).join('/')
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  try {
    const data = await getObject(key)
    return new Response(new Uint8Array(data), { headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'private, max-age=3600' } })
  } catch {
    throw new AppError('Fichier introuvable', 404)
  }
})
