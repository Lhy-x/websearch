import Link from 'next/link'
import { ArrowRight, Check, CircleHelp, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, Notice, PageHeader } from '@/components/ui/primitives'
import { WORKFLOW } from '@/components/workflow'

export const metadata = { title: 'Prise en main' }
const instructions = [
  ['Indiquez une ville et une activité dans la recherche.', 'Ouvrez une entreprise dans les résultats et vérifiez ses coordonnées.', 'Vous avez déjà une liste ? Importez-la depuis « Mes prospects ».'],
  ['Connectez votre IA dans Paramètres → Mon IA, une seule fois.', 'Sélectionnez une entreprise dans le générateur.', 'Cliquez sur « Créer le site sur mesure ». Le site s’ouvre quand il est prêt.'],
  ['Ouvrez votre démo et relisez les informations sur ordinateur et mobile.', 'Cliquez sur « Préparer l’email », puis sur « Rédiger mon email ». Ajustez le message.', 'Ouvrez votre messagerie pour envoyer le brouillon, ou copiez le texte et le lien.'],
  ['Définissez votre prix unique et vos clés de test dans Paramètres → Paiement.', 'Une fois Stripe configuré, le bouton de commande apparaît sur les démos actives.', 'Après confirmation du paiement, le client accède à la facture et au ZIP du site.'],
]
export default function GuidePage() {
  return <>
    <PageHeader title="Un premier site, pas à pas." description="Le chemin le plus court entre une entreprise et une proposition qui donne envie." actions={<Button asChild><Link href="/search">Commencer<ArrowRight/></Link></Button>}/>
    <Notice title="Commencez simplement">Vous pouvez trouver des prospects et préparer vos démos avant de configurer le paiement. Les outils avancés restent disponibles dans le menu quand vous en avez besoin.</Notice>
    <div className="mt-6 grid gap-5 md:grid-cols-2">{WORKFLOW.map((step, i) => <Card key={step.href}><CardHeader title={<span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary/8 text-primary"><step.icon size={18}/></span><span>{i + 1}. {step.title}</span></span>} description={step.description}/><CardBody><ol className="mb-6 space-y-4">{instructions[i]!.map(text => <li key={text} className="flex items-start gap-3 text-xs leading-6 text-muted"><Check size={14} className="mt-1 shrink-0 text-primary"/>{text}</li>)}</ol><Button variant="outline" asChild><Link href={step.href}>{step.title}<ArrowRight/></Link></Button></CardBody></Card>)}</div>
    <Card className="mt-6"><CardHeader title={<span className="flex items-center gap-2"><CircleHelp size={18}/>Les réponses utiles</span>}/><CardBody className="space-y-3">
      {[
        ['Mon lien localhost fonctionne-t-il chez le prospect ?', 'Non. localhost ouvre uniquement votre propre ordinateur. Pour partager une démo avec un client, hébergez l’application avec une adresse publique HTTPS, puis renseignez cette adresse dans Paramètres → Paiement. Saisir un domaine ne publie pas l’application.'],
        ['Est-ce qu’un email part automatiquement ?', 'Le bouton « Préparer l’email » crée un brouillon. Vous pouvez le modifier, le copier ou l’ouvrir dans votre messagerie pour l’envoyer. Les envois automatiques se règlent séparément dans les campagnes avancées.'],
        ['Que reçoit le client après son paiement ?', 'Un lien privé donne accès à la facture Stripe et au ZIP de la version achetée. Le ZIP contient le site à héberger. L’hébergement du site client n’est pas automatique.'],
        ['Comment retirer une démo ?', 'Utilisez l’icône de corbeille sur sa carte. Le lien public devient indisponible. Vous pouvez restaurer la démo dans « Corbeille ». Les achats et factures déjà réglés sont conservés.'],
      ].map(([question, answer]) => <details key={question} className="ui-details"><summary>{question}</summary><p className="text-xs leading-7 text-muted">{answer}</p></details>)}
    </CardBody></Card>
    <div className="next-action"><span className="next-action-icon"><Sparkles size={19}/></span><div><p className="eyebrow">UNE SEULE FOIS</p><h2>Faites de cet espace le vôtre.</h2><p>Votre IA, votre signature email et votre prix de vente.</p></div><Link className="next-action-link" href="/settings">Configurer mon espace<ArrowRight size={16}/></Link></div>
  </>
}
