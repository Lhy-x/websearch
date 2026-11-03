'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, Field, Input } from '@/components/ui/primitives'
import { api } from '@/lib/utils'

export function LoginForm({nextPath,initialError}:{nextPath?:string;initialError?:string}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [busy, setBusy] = useState(false)
  return (
    <Card className="login-form-card">
      <form
        method="post"
        action="/api/auth/login"
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          setBusy(true)
          setError(null)
          try {
            await api('/api/auth/login', { method: 'POST', json: { email: fd.get('email'), password: fd.get('password') } })
            const next = nextPath
            router.push(next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !/[\x00-\x1f]/.test(next) ? next : '/')
            router.refresh()
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <input type="hidden" name="next" value={nextPath ?? '/'} />
        <Field label="Email"><Input name="email" type="email" autoComplete="username" required autoFocus /></Field>
        <Field label="Mot de passe"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
        <Button type="submit" className="h-12 w-full rounded-xl" loading={busy}>Se connecter</Button>
      </form>
    </Card>
  )
}
