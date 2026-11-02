import { jwtVerify, SignJWT } from 'jose'

/** Session token helpers — dependency-free so they run in the proxy (edge or node) and in route handlers. */
export const SESSION_COOKIE = 'pf_session'
export const SESSION_TTL_S = 7 * 24 * 3600

function key(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET manquant ou trop court (32 caractères minimum)')
  return new TextEncoder().encode(s)
}

export async function signSession(email: string): Promise<string> {
  return new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setSubject(email).setIssuedAt().setExpirationTime(`${SESSION_TTL_S}s`).sign(key())
}

export async function verifySession(token: string | undefined | null): Promise<{ email: string } | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    const admin = process.env.ADMIN_EMAIL
    if (payload.role !== 'admin' || !payload.sub || (admin && payload.sub.toLowerCase() !== admin.toLowerCase())) return null
    return { email: payload.sub }
  } catch {
    return null
  }
}
