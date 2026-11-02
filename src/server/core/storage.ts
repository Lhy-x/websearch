import { mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises'
import path from 'node:path'
import { env } from './env'

/** Local-disk object storage. Keys are relative, validated paths (no traversal). */
export function storageRoot(): string {
  return path.resolve(env().STORAGE_DIR)
}

export function resolveKey(key: string): string {
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(key) || key.includes('..') || key.startsWith('/')) throw new Error(`Clé de stockage invalide: ${key}`)
  const full = path.resolve(storageRoot(), key)
  if (!full.startsWith(storageRoot() + path.sep)) throw new Error('Clé de stockage hors racine')
  return full
}

export async function putObject(key: string, data: Buffer | string): Promise<{ key: string; size: number }> {
  const full = resolveKey(key)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, data)
  return { key, size: typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength }
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(resolveKey(key))
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await stat(resolveKey(key))
    return true
  } catch {
    return false
  }
}

export async function deleteObject(key: string) {
  await rm(resolveKey(key), { force: true, recursive: true })
}
