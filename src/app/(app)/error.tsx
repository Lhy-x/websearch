'use client'
import Link from 'next/link'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/primitives'
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <Card><EmptyState title="Cette page n’a pas pu s’ouvrir" description="Une erreur a interrompu le chargement. Vous pouvez réessayer ou revenir à l’accueil." action={<div className="flex flex-wrap justify-center gap-3"><Button onClick={reset}><RefreshCw/>Réessayer</Button><Button variant="outline" asChild><Link href="/"><ArrowLeft/>Revenir à l’accueil</Link></Button></div>}/></Card>
}
