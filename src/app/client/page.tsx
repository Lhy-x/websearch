import { Layers2 } from 'lucide-react'
import { CustomerAccessForm } from './access-form'

export const metadata = { title: 'Retrouver mon espace client', robots: { index: false, follow: false } }

export default function CustomerAccessPage() {
  return <main className="public-checkout"><div className="checkout-card">
    <div className="checkout-brand"><Layers2 size={22}/>ProspectForge<span className="ml-auto text-[10px] font-normal text-muted">Espace client</span></div>
    <h1>Retrouver mon espace</h1>
    <p className="checkout-copy">Saisissez l’adresse email utilisée lors du paiement. Vous recevrez le lien de votre espace client : pas de mot de passe à retenir.</p>
    <CustomerAccessForm/>
    <p className="checkout-footer">Le lien est personnel. Ne le transférez pas : il donne accès à votre site et à votre abonnement.</p>
  </div></main>
}
