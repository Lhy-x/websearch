import { ArrowUpRight, Sparkles } from 'lucide-react'
import { LoginForm } from './login-form'

export const metadata = { title: 'Connexion' }

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string;error?:string}>}) {
  const params=await searchParams
  const messages:Record<string,string>={credentials:'Identifiants incorrects',limited:'Trop de tentatives. Réessayez dans 15 minutes.',configuration:'Administrateur non configuré.',invalid:'Saisissez un email et un mot de passe valides.'}
  return <main className="login-studio">
    <section className="login-editorial">
      <div className="login-brand"><span><Sparkles className="size-5"/></span>ProspectForge<span className="login-brand-label">STUDIO</span></div>
      <div className="login-story"><p className="studio-step">LA PROSPECTION, AVEC UNE AUTRE DIMENSION.</p><h1>De belles idées.<br/>De vraies<br/><span>opportunités.</span></h1><p>Repérez les entreprises qui méritent mieux. Imaginez leur prochaine identité. Transformez une rencontre en projet.</p></div>
      <div className="login-sculpture" aria-hidden="true"><div className="login-glass-piece piece-a"/><div className="login-glass-piece piece-b"/><div className="login-glass-piece piece-c"/></div>
      <div className="login-bottom"><span>VOTRE ATELIER DE PROSPECTION</span><ArrowUpRight className="size-5"/></div>
    </section>
    <section className="login-access"><div className="login-form-wrap"><div className="login-access-kicker"><span className="studio-live-dot"/> ESPACE PRIVÉ</div><h2>Reprenons<br/>là où vous étiez.</h2><p className="mb-8 mt-4 max-w-sm text-sm leading-relaxed text-muted">Connectez-vous pour retrouver vos prospects, vos créations et vos prochaines opportunités.</p><LoginForm nextPath={typeof params.next === 'string' ? params.next : undefined} initialError={typeof params.error === 'string' && Object.hasOwn(messages, params.error) ? messages[params.error] : undefined}/><p className="mt-8 text-xs leading-relaxed text-muted">Un espace personnel. Votre travail, vos données,<br/>votre manière de créer.</p></div><span className="login-access-footer">PROSPECTFORGE — L’ATELIER INDÉPENDANT</span></section>
  </main>
}
