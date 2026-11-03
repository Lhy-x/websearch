import Link from 'next/link'
import { ArrowRight, Building2, CreditCard, Mail, WandSparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export const WORKFLOW = [
  { title: 'Trouver un prospect', short: 'Prospect', href: '/search', icon: Building2, description: 'Une entreprise à qui proposer votre savoir-faire.' },
  { title: 'Créer son site', short: 'Création', href: '/generator', icon: WandSparkles, description: 'Un site personnalisé, prêt à présenter.' },
  { title: 'Envoyer la démo', short: 'Proposition', href: '/sites', icon: Mail, description: 'Un aperçu et un email que vous pouvez ajuster.' },
  { title: 'Suivre la vente', short: 'Vente', href: '/sales', icon: CreditCard, description: 'Le paiement, la facture et la livraison du site.' },
]

export function WorkflowSteps({ current }: { current: number }) {
  return <nav aria-label="Étapes de création" className="workflow-steps"><span className="workflow-caption">VOTRE PARCOURS</span><ol>{WORKFLOW.map((step, index) => <li key={step.href}><Link href={step.href} aria-current={current === index + 1 ? 'step' : undefined} className={cn('workflow-step', current === index + 1 && 'is-current')}><span>{index + 1}</span><strong>{step.short}</strong></Link>{index < 3 ? <ArrowRight size={13} aria-hidden="true"/> : null}</li>)}</ol><span className="workflow-position">Étape {current} sur 4</span></nav>
}

export function NextAction({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return <div className="next-action"><span className="next-action-icon"><ArrowRight size={19}/></span><div><p className="eyebrow">LA SUITE</p><h2>{title}</h2><p>{description}</p></div><Link href={href} className="next-action-link">{action}<ArrowRight size={16}/></Link></div>
}
