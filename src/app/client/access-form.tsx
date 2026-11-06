'use client'
import { useState } from 'react'
import { ArrowRight, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Notice } from '@/components/ui/primitives'

type Result = { sent: true; testLinks: { businessName: string; url: string }[] }

export function CustomerAccessForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const res = await fetch('/api/customer/access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const data = await res.json().catch(() => ({})) as Result & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Service momentanément indisponible. Réessayez dans quelques instants.')
      setResult(data)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  if (result) return <div className="mt-7 space-y-4">
    <Notice tone="success" title="Vérifiez votre boîte de réception">Si un achat correspond à {email}, un email avec le lien de votre espace vient de partir. Pensez à regarder dans les courriers indésirables.</Notice>
    {result.testLinks.length ? <Notice tone="warning" title="Mode test : aucun email n’est envoyé">En production, ces liens arrivent uniquement par email.{result.testLinks.map(link => <a key={link.url} className="mt-2 block break-all font-medium underline" href={link.url}>{link.businessName}</a>)}</Notice> : null}
    <Button variant="outline" className="w-full" onClick={() => setResult(null)}>Utiliser une autre adresse</Button>
  </div>
  return <form className="mt-7 space-y-4" onSubmit={submit}>
    <Field label="Adresse email"><Input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@entreprise.fr"/></Field>
    {error ? <Notice tone="warning">{error}</Notice> : null}
    <Button type="submit" size="lg" className="w-full" loading={busy}><MailCheck/>Recevoir mon lien<ArrowRight/></Button>
  </form>
}
