import { Suspense } from 'react'
import { LoginForm } from './login-form'

export const metadata = { title: 'Connexion' }

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">ProspectForge</h1>
        <p className="mb-6 text-sm text-muted">Espace privé — administrateur unique.</p>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  )
}
