import { Skeleton } from '@/components/ui/primitives'
export default function Loading() {
  return <section aria-busy="true" aria-label="Chargement de la page" className="space-y-7"><p role="status" className="text-xs text-muted">Votre espace se prépare…</p><Skeleton className="h-9 w-2/3 max-w-md"/><Skeleton className="h-4 w-4/5 max-w-xl"/><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1,2,3,4].map(n=><Skeleton key={n} className="h-36 rounded-3xl"/>)}</div><Skeleton className="h-72 w-full rounded-3xl"/></section>
}
