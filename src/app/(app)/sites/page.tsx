import {SiteActions} from '@/components/site-actions'
import Link from 'next/link'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { sql } from '@/server/core/db'
import { getSettings } from '@/server/core/settings'
import { previewUrl } from '@/server/proposals/service'
import { fmtDate, fmtUsd } from '@/lib/utils'

export const metadata = { title: 'Sites générés' }
export const dynamic = 'force-dynamic'

export default async function SitesPage({ searchParams }: { searchParams: Promise<{ status?: string;trash?:string }> }) {
  const sp = await searchParams
  const settings = await getSettings()
  const sites = await sql()<{ id: string; business_id: string; business_name: string; city: string | null; template_id: string; style: string; status: string; current_version: number | null; preview_token: string; preview_enabled: boolean; preview_expires_at: Date | null; generator: string | null; model: string | null; cost_usd: string; duration_ms: number | null; view_count: number; created_at: Date; thumbnail: string | null; error: string | null }[]>`
    select g.id, g.business_id, b.name business_name, b.city, g.template_id, g.style, g.status, g.current_version, g.preview_token, g.preview_enabled, g.preview_expires_at,
      g.generator, g.model, g.cost_usd, g.duration_ms, g.view_count, g.created_at, g.error,
      (select path from website_assets a where a.website_id = g.id and a.kind = 'thumbnail' order by created_at desc limit 1) thumbnail
    from generated_websites g join businesses b on b.id = g.business_id
    where g.deleted_at is ${sp.trash==='1'?sql()`not null`:sql()`null`} and ${sp.status ? sql()`g.status = ${sp.status}` : sql()`true`}
    order by g.created_at desc limit 200`
  return (
    <>
      <PageHeader title="Sites générés" description={`${sites.length} démonstration(s)`} actions={<><Button variant="outline" asChild><Link href={sp.trash==='1'?'/sites':'/sites?trash=1'}>{sp.trash==='1'?'Sites actifs':'Corbeille'}</Link></Button><Button asChild><Link href="/generator">Créer un site</Link></Button></>} />
      {sites.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {sites.map((s) => {
            const expired = s.preview_expires_at && s.preview_expires_at < new Date()
            const thumbnail = s.thumbnail ? <img src={`/api/files/${s.thumbnail}`} alt={`Aperçu ${s.business_name}`} className="aspect-[16/10] w-full border-b border-border object-cover object-top" /> : <div className="grid aspect-[16/10] place-items-center border-b border-border bg-panel-2 text-xs text-muted">{s.status === 'READY' ? 'Capture en attente du worker' : s.status}</div>
            return (
              <Card key={s.id} className="overflow-hidden">
                {sp.trash === '1' ? thumbnail : <Link href={`/sites/${s.id}`}>{thumbnail}</Link>}
                <div className="space-y-1.5 p-3 text-xs">
                  <Link href={`/prospects/${s.business_id}`} className="block truncate text-sm font-medium hover:text-primary">{s.business_name}</Link>
                  <p className="text-muted">Version {s.current_version ?? '—'} · {s.city??''}</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={s.status === 'READY' ? 'success' : s.status === 'ERROR' ? 'danger' : 'neutral'}>{s.status}</Badge>
                    {!s.preview_enabled ? <Badge>démo désactivée</Badge> : expired ? <Badge tone="warning">expirée</Badge> : null}
                    <Badge tone={s.generator?.startsWith('ai') ? 'primary' : 'neutral'}>{s.generator?.startsWith('ai') ? 'IA' : 'déterministe'}</Badge>
                  </div>
                  <p className="text-muted">{fmtDate(s.created_at)} · {fmtUsd(s.cost_usd)} · {s.duration_ms ? `${(s.duration_ms / 1000).toFixed(1)} s` : '—'} · {s.view_count} vue(s)</p>
                  {s.error ? <p className="line-clamp-2 text-danger">{s.error}</p> : null}
                  <SiteActions id={s.id} businessId={s.business_id} name={s.business_name} demoUrl={previewUrl(s.preview_token,settings.sites.previewBaseUrl)} deleted={sp.trash==='1'} active={s.status==='READY'&&s.preview_enabled&&!expired}/>
                  <div className={`flex gap-3 pt-1 ${sp.trash==='1'?'hidden':''}`}>
                    <Link className="text-primary" href={`/sites/${s.id}`}>Éditer</Link>
                    {s.status === 'READY' && s.preview_enabled && !expired ? <a className="text-primary" target="_blank" rel="noopener noreferrer" href={previewUrl(s.preview_token, settings.sites.previewBaseUrl)}>Démo publique</a> : null}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card><EmptyState title="Aucun site généré" description="Sélectionnez des prospects puis « Générer les sites », ou utilisez le Générateur." action={<Button asChild><Link href="/generator">Ouvrir le générateur</Link></Button>} /></Card>
      )}
    </>
  )
}
