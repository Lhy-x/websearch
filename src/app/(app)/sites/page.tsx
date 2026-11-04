import Link from 'next/link'
import { Eye, Globe2, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { SiteActions } from '@/components/site-actions'
import { Badge, Card, EmptyState, Input, PageHeader } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { sql } from '@/server/core/db'
import { getPreviewBaseUrl, getSettings } from '@/server/core/settings'
import { previewUrl } from '@/server/proposals/service'
import { fmtDate } from '@/lib/utils'

export const metadata = { title: 'Mes démos' }
export const dynamic = 'force-dynamic'
const STATUS: Record<string, string> = { READY: 'Prête', GENERATING: 'En création', ERROR: 'À reprendre', DISABLED: 'Désactivée' }
export default async function SitesPage({ searchParams }: { searchParams: Promise<{ status?: string; trash?: string; q?: string }> }) {
  const sp = await searchParams
  const trash = sp.trash === '1'
  const settings = await getSettings()
  const previewBase=await getPreviewBaseUrl(settings)
  const sites = await sql()<{ id: string; business_id: string; business_name: string; city: string | null; status: string; current_version: number | null; preview_token: string; preview_enabled: boolean; preview_expires_at: Date | null; view_count: number; created_at: Date; thumbnail: string | null; error: string | null }[]>`
    select g.id,g.business_id,b.name business_name,b.city,g.status,g.current_version,g.preview_token,g.preview_enabled,g.preview_expires_at,g.view_count,g.created_at,g.error,
    (select path from website_assets a where a.website_id=g.id and a.kind='thumbnail' order by created_at desc limit 1) thumbnail
    from generated_websites g join businesses b on b.id=g.business_id
    where g.deleted_at is ${trash ? sql()`not null` : sql()`null`} and ${sp.status ? sql()`g.status=${sp.status}` : sql()`true`}
    and ${sp.q?.trim() ? sql()`(b.name ilike ${'%' + sp.q.trim() + '%'} or b.city ilike ${'%' + sp.q.trim() + '%'})` : sql()`true`}
    order by g.created_at desc limit 200`
  const tabs = [{ label: 'Toutes', href: '/sites', active: !trash && !sp.status }, { label: 'Prêtes', href: '/sites?status=READY', active: !trash && sp.status === 'READY' }, { label: 'En création', href: '/sites?status=GENERATING', active: !trash && sp.status === 'GENERATING' }]
  return <>
    <PageHeader title={trash ? 'Corbeille' : 'Mes démos'} description={trash ? 'Restaurez une démo pour rendre son lien public à nouveau accessible.' : 'Vos créations, prêtes à devenir de nouvelles opportunités.'} actions={<><Button variant="outline" asChild><Link href={trash ? '/sites' : '/sites?trash=1'}>{trash ? <Globe2/> : <Trash2/>}{trash ? 'Démos actives' : 'Corbeille'}</Link></Button><Button asChild><Link href="/generator"><Plus/>Créer un site</Link></Button></>}/>
    <div className="page-toolbar">{!trash ? <nav className="segmented-links" aria-label="Filtrer les démos">{tabs.map(t => <Link key={t.href} href={t.href} aria-current={t.active ? 'page' : undefined}>{t.label}</Link>)}</nav> : <p className="text-xs text-muted">{sites.length} démo(s) conservée(s)</p>}<form action="/sites" className="relative w-full sm:w-64">{trash ? <input type="hidden" name="trash" value="1"/> : null}{sp.status ? <input type="hidden" name="status" value={sp.status}/> : null}<Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted"/><Input name="q" defaultValue={sp.q} placeholder="Rechercher une démo…" aria-label="Rechercher une démo" className="bg-panel pl-10"/></form></div>
    {sites.length ? <div className="site-grid">{sites.map(s => {
      const expired = !!s.preview_expires_at && s.preview_expires_at < new Date()
      const active = s.status === 'READY' && s.preview_enabled && !expired
      const thumbnail = s.thumbnail ? <img src={`/api/files/${s.thumbnail}`} alt={`Aperçu du site de ${s.business_name}`}/> : <div className="site-placeholder"><span>{s.business_name.slice(0, 1).toUpperCase()}</span>{s.status === 'GENERATING' ? 'Le site prend forme…' : 'Votre création personnalisée'}</div>
      return <Card key={s.id} className="overflow-hidden">{trash ? <div className="site-thumbnail">{thumbnail}</div> : <Link href={`/sites/${s.id}`} className="site-thumbnail" aria-label={`Ouvrir le site de ${s.business_name}`}>{thumbnail}</Link>}<div className="site-card-body"><div className="site-card-title"><h2 title={s.business_name}>{s.business_name}</h2><Badge tone={s.status === 'READY' ? 'success' : s.status === 'ERROR' ? 'danger' : 'neutral'}>{STATUS[s.status] ?? s.status}</Badge></div><p className="site-card-meta"><MapPin size={12}/>{s.city ?? 'Ville non renseignée'}<span>·</span>Version {s.current_version ?? '—'}</p>{!trash && !active && s.status === 'READY' ? <p className="mt-3 text-xs text-warning">{expired ? 'Démo expirée : ajustez sa durée dans l’éditeur.' : 'Lien public désactivé : réactivez-le dans l’éditeur.'}</p> : null}{s.error ? <p className="mt-3 line-clamp-2 text-xs text-danger">{s.error}</p> : null}<div className="site-metrics"><span><Eye size={12}/>{s.view_count} vue{s.view_count > 1 ? 's' : ''}</span><span>Créée le {fmtDate(s.created_at, false)}</span></div>{!trash ? <div className="site-card-toolbar"><Button size="sm" variant="outline" asChild disabled={!active}><a href={previewUrl(s.preview_token, previewBase)} target="_blank" rel="noopener noreferrer"><Eye/>Voir la démo</a></Button><Button size="sm" variant="ghost" asChild><Link href={`/sites/${s.id}`}><Pencil/>Modifier</Link></Button></div> : null}<SiteActions id={s.id} businessId={s.business_id} name={s.business_name} demoUrl={previewUrl(s.preview_token, previewBase)} deleted={trash} active={active}/></div></Card>
    })}</div> : <Card><EmptyState icon={trash ? <Trash2/> : <Globe2/>} title={trash ? 'La corbeille est vide' : sp.q || sp.status ? 'Aucune démo dans cette vue' : 'Votre première démo commence ici'} description={trash ? 'Les démos que vous supprimez pourront être restaurées ici.' : sp.q || sp.status ? 'Modifiez votre recherche ou affichez toutes vos démos.' : 'Choisissez une entreprise et laissez votre IA créer son site personnalisé.'} action={<Button variant="outline" asChild><Link href={trash || sp.q || sp.status ? '/sites' : '/generator'}>{trash ? 'Retour aux démos' : sp.q || sp.status ? 'Toutes mes démos' : 'Créer mon premier site'}</Link></Button>}/></Card>}
  </>
}
