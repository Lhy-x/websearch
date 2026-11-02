import Link from 'next/link'
import { Download } from 'lucide-react'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { ProspectTable } from '@/components/prospect-table'
import { listBusinesses, listFiltersSchema } from '@/server/business/queries'
import { fmtInt } from '@/lib/utils'
import { ProspectFilters } from './filters'
import { ImportButton } from './import-button'

export const metadata = { title: 'Base de prospects' }

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const f = listFiltersSchema.parse(sp)
  const { rows, total } = await listBusinesses(f)
  const qs = new URLSearchParams(sp)
  const pages = Math.max(1, Math.ceil(total / f.pageSize))
  const pageHref = (p: number) => {
    const q = new URLSearchParams(qs)
    q.set('page', String(p))
    return `/prospects?${q}`
  }
  return (
    <>
      <PageHeader
        title="Base de prospects"
        description={`${fmtInt(total)} prospect(s)`}
        actions={
          <>
            <ImportButton />
            <Button variant="outline" asChild><a href={`/api/prospects/export?${qs}`}><Download />Exporter CSV</a></Button>
          </>
        }
      />
      <Suspense><ProspectFilters /></Suspense>
      <Card className="mt-4">
        {rows.length ? (
          <>
            <ProspectTable rows={rows} />
            <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
              <span>Page {f.page} / {pages}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" asChild disabled={f.page <= 1}><Link href={pageHref(Math.max(1, f.page - 1))}>Précédent</Link></Button>
                <Button size="sm" variant="outline" asChild disabled={f.page >= pages}><Link href={pageHref(Math.min(pages, f.page + 1))}>Suivant</Link></Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="Aucun prospect" description="Lancez une recherche ou importez un fichier CSV / JSON / XLSX." action={<Button asChild><Link href="/search">Rechercher des prospects</Link></Button>} />
        )}
      </Card>
    </>
  )
}
