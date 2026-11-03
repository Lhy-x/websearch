'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight, MapPin, Search, Download, List, Loader2, Map as MapIcon, Play, Save, Trash2, CheckCircle2, XCircle, CircleDashed } from 'lucide-react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Notice, Select, Skeleton } from '@/components/ui/primitives'
import { Dialog } from '@/components/ui/dialog'
import { ProspectTable, type ProspectRow } from '@/components/prospect-table'
import { useSelection } from '@/components/selection'
import { SECTORS } from '@/lib/sectors'
import { api, fmtInt, fmtRelative } from '@/lib/utils'

const ProspectMap = dynamic(() => import('@/components/prospect-map').then((m) => m.ProspectMap), { ssr: false, loading: () => <Skeleton className="h-[520px] w-full" /> })

interface Connector { id: string; label: string; configured: boolean; enabled: boolean; message: string }
interface RunInfo {
  run: { id: string; status: string; params: Record<string, unknown> & { resolvedLat?: number; resolvedLon?: number; radiusKm?: number }; total_found: number; new_count: number; merge_pending_count: number; source_reports: { source?: string; status?: string; count?: number; message?: string; ms?: number }[]; error: string | null; job_status: string | null; progress: number | null; progress_message: string | null; job_error: string | null }
  logs: { level: string; message: string; created_at: string }[]
  workersOnline: number
}

type Form = {
  country: 'FR' | 'BE' | 'CH'; region: string; department: string; city: string; postcode: string; lat: string; lon: string; radiusKm: number; sector: string; keywords: string
  sources: string[]; maxResults: number; websiteFilter: string; requireEmail: boolean; requirePhone: boolean; excludeContacted: boolean
}

export function SearchWorkspace({ defaults, connectors }: { defaults: { country: 'FR' | 'BE' | 'CH'; radiusKm: number; maxResults: number }; connectors: Connector[] }) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const qc = useQueryClient()
  const runId = sp.get('run')
  const [form, setForm] = useState<Form>({
    country: defaults.country, region: '', department: '', city: '', postcode: '', lat: '', lon: '', radiusKm: defaults.radiusKm, sector: 'hair_salon', keywords: '',
    sources: connectors.filter((c) => c.enabled && c.configured).map((c) => c.id), maxResults: defaults.maxResults, websiteFilter: 'no_website', requireEmail: false, requirePhone: false, excludeContacted: true,
  })
  const [view, setView] = useState<'table' | 'map'>('table')
  const [page, setPage] = useState(1)
  const [saveOpen, setSaveOpen] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const params = () => ({
    country: form.country, region: form.region || null, department: form.department || null, city: form.city || null, postcode: form.postcode || null,
    lat: form.lat ? Number(form.lat) : null, lon: form.lon ? Number(form.lon) : null, radiusKm: Number(form.radiusKm), sector: form.sector || null, keywords: form.keywords || null,
    sources: form.sources, maxResults: Number(form.maxResults), websiteFilter: form.websiteFilter, requireEmail: form.requireEmail, requirePhone: form.requirePhone, excludeContacted: form.excludeContacted,
  })

  const start = useMutation({
    mutationFn: () => api<{ runId: string }>('/api/search/runs', { method: 'POST', json: params() }),
    onSuccess: (r) => {
      setPage(1)
      router.push(`${path}?run=${r.runId}`)
      qc.invalidateQueries({ queryKey: ['runs'] })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const runQ = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api<RunInfo>(`/api/search/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(q.state.data.run.status) ? false : 1500),
  })
  const run = runQ.data?.run
  // restore the form from the run parameters (shareable URL)
  useEffect(() => {
    if (!run) return
    const p = run.params as Record<string, unknown>
    // stored params use null for "not set": never feed null/undefined to a controlled input
    const str = (k: string) => (p[k] == null ? '' : String(p[k]))
    setForm((f) => ({
      ...f,
      country: (p.country as Form['country']) ?? f.country,
      region: str('region'), department: str('department'), city: str('city'), postcode: str('postcode'),
      lat: str('lat'), lon: str('lon'), sector: str('sector'), keywords: str('keywords'),
      radiusKm: typeof p.radiusKm === 'number' ? p.radiusKm : f.radiusKm,
      maxResults: typeof p.maxResults === 'number' ? p.maxResults : f.maxResults,
      sources: Array.isArray(p.sources) ? (p.sources as string[]) : f.sources,
      websiteFilter: typeof p.websiteFilter === 'string' ? p.websiteFilter : f.websiteFilter,
      requireEmail: p.requireEmail === true, requirePhone: p.requirePhone === true, excludeContacted: p.excludeContacted !== false,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id])

  const filterQs = useMemo(() => {
    const q = new URLSearchParams({ runId: runId ?? '', websiteFilter: form.websiteFilter, page: String(page), pageSize: '50', sort: 'score' })
    if (form.requireEmail) q.set('requireEmail', 'true')
    if (form.requirePhone) q.set('requirePhone', 'true')
    if (form.excludeContacted) q.set('excludeContacted', 'true')
    return q.toString()
  }, [runId, form.websiteFilter, form.requireEmail, form.requirePhone, form.excludeContacted, page])

  const results = useQuery({
    queryKey: ['results', filterQs],
    queryFn: () => api<{ rows: (ProspectRow & { lat: number | null; lon: number | null })[]; total: number }>(`/api/prospects?${filterQs}`),
    enabled: run?.status === 'COMPLETED',
  })
  const mapQ = useQuery({
    queryKey: ['results-map', filterQs.replace(/page=\d+/, '')],
    queryFn: () => api<{ rows: (ProspectRow & { lat: number | null; lon: number | null })[]; total: number }>(`/api/prospects?${filterQs.replace(/page=\d+&pageSize=50/, 'page=1&pageSize=500')}`),
    enabled: run?.status === 'COMPLETED' && view === 'map',
  })
  const sel = useSelection()

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Votre recherche" description="Une ville, une activité. On s’occupe de trouver les entreprises." />
          <CardBody>
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); start.mutate() }}>
              <p className="eyebrow">1. OÙ CHERCHER ?</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pays">
                  <Select value={form.country} onChange={(e) => set('country', e.target.value as Form['country'])}>
                    <option value="FR">France</option><option value="BE">Belgique</option><option value="CH">Suisse</option>
                  </Select>
                </Field>
                <Field label="Rayon (km)"><Input type="number" min={0.5} max={100} step={0.5} value={form.radiusKm} onChange={(e) => set('radiusKm', Number(e.target.value))} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ville"><Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Rouen" /></Field>
                <Field label="Code postal"><Input value={form.postcode} onChange={(e) => set('postcode', e.target.value)} placeholder="76000" /></Field>
              </div>
              <details className="ui-details">
                <summary className="cursor-pointer text-muted">Région, département, coordonnées…</summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Région"><Input value={form.region} onChange={(e) => set('region', e.target.value)} /></Field>
                  <Field label="Département / canton"><Input value={form.department} onChange={(e) => set('department', e.target.value)} /></Field>
                  <Field label="Latitude"><Input inputMode="decimal" value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="49.4431" /></Field>
                  <Field label="Longitude"><Input inputMode="decimal" value={form.lon} onChange={(e) => set('lon', e.target.value)} placeholder="1.0993" /></Field>
                </div>
                <p className="mt-2 text-muted">Les coordonnées, si renseignées, priment sur la ville. Région et département sont enregistrés avec la recherche ; le périmètre est défini par le centre et le rayon.</p>
              </details>
              <p className="eyebrow pt-2">2. QUELLE ACTIVITÉ ?</p>
              <Field label="Secteur d’activité">
                <Select value={form.sector} onChange={(e) => set('sector', e.target.value)}>
                  <option value="">Tous secteurs (mots-clés requis)</option>
                  {SECTORS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
              </Field>
              <Field label="Mots-clés" hint="Filtre sur le nom et la catégorie (séparés par des virgules)"><Input value={form.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder="barbier, coloration" /></Field>
              <details className="ui-details" open={!form.sources.length?true:undefined}><summary>Sources de recherche · {form.sources.length} sélectionnée(s)</summary><Field group label="Sources">
                <div className="space-y-1.5">
                  {connectors.map((c) => (
                    <label key={c.id} className="flex items-start gap-2 text-xs">
                      <input type="checkbox" className="mt-0.5" disabled={!c.configured} checked={form.sources.includes(c.id)} onChange={(e) => set('sources', e.target.checked ? [...form.sources, c.id] : form.sources.filter((s) => s !== c.id))} />
                      <span>
                        <span className="font-medium">{c.label}</span>
                        {!c.configured ? <Badge tone="warning" className="ml-1.5">Non configuré</Badge> : null}
                        <span className="block text-muted">{c.message}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </Field></details>
              {!form.sources.length?<Notice tone="warning" title="Choisissez au moins une source">Activez une source disponible ci-dessus, ou configurez-la dans <Link className="underline" href="/settings?tab=search">les paramètres</Link>.</Notice>:null}
              <p className="eyebrow pt-2">3. QUELS PROSPECTS ?</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Présence web">
                  <Select value={form.websiteFilter} onChange={(e) => { set('websiteFilter', e.target.value); setPage(1) }}>
                    <option value="any">Tous</option>
                    <option value="no_website">Aucun site connu</option>
                    <option value="no_website_confirmed">Absence confirmée</option>
                    <option value="website_issues">Site avec défauts</option>
                    <option value="has_website">Avec site</option>
                  </Select>
                </Field>
                <Field label="Résultats max"><Input type="number" min={10} max={5000} value={form.maxResults} onChange={(e) => set('maxResults', Number(e.target.value))} /></Field>
              </div>
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.requireEmail} onChange={(e) => set('requireEmail', e.target.checked)} />Email disponible</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.requirePhone} onChange={(e) => set('requirePhone', e.target.checked)} />Téléphone disponible</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.excludeContacted} onChange={(e) => set('excludeContacted', e.target.checked)} />Exclure les entreprises déjà prospectées</label>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" className="min-w-0 flex-1" loading={start.isPending} disabled={!form.sources.length}><Search />Lancer la recherche</Button>
                <Button type="button" variant="outline" onClick={() => setSaveOpen(true)} aria-label="Enregistrer la recherche"><Save /></Button>
              </div>
            </form>
          </CardBody>
        </Card>
        <SavedSearches onOpenRun={(id) => router.push(`${path}?run=${id}`)} />
      </div>

      <div className="min-w-0 space-y-4">
        {!runId ? (
          <Card><CardBody className="py-12"><div className="mx-auto mb-7 grid size-20 place-items-center rounded-3xl border border-primary/10 bg-primary/5 text-primary"><MapPin size={32} strokeWidth={1.5}/></div><h2 className="text-center text-2xl font-medium tracking-tight">Vos prochains clients sont quelque part ici.</h2><p className="mx-auto mt-4 max-w-md text-center text-xs leading-7 text-muted">Commencez avec une ville et une activité. Les entreprises trouvées seront enregistrées dans votre liste de prospects.</p><ol className="mx-auto mt-9 grid max-w-md gap-4">{['Choisissez votre zone et votre activité.','Lancez la recherche et laissez le traitement se terminer.','Ouvrez une entreprise, vérifiez sa fiche, puis créez son site.'].map((text,i)=><li key={text} className="flex items-center gap-3 text-xs text-muted"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-panel-2 text-primary">{i+1}</span>{text}</li>)}</ol><div className="mt-8 border-t border-border pt-6 text-center"><Link href="/prospects" className="inline-flex items-center gap-2 text-xs font-medium text-primary">J’ai déjà des prospects<ArrowRight size={14}/></Link></div></CardBody></Card>
        ) : runQ.isError ? (<Notice tone="danger" title="Cette recherche ne peut pas être chargée"><p>{(runQ.error as Error).message}</p><Button size="sm" variant="outline" className="mt-3" onClick={()=>runQ.refetch()}>Réessayer</Button></Notice>) : !run ? (
          <Card className="p-5"><Skeleton className="h-6 w-1/3" /><Skeleton className="mt-3 h-40 w-full" /></Card>
        ) : run.status !== 'COMPLETED' ? (
          <RunProgress info={runQ.data!} />
        ) : (
          <Card>
            <CardHeader
              title={`${fmtInt(results.data?.total)} prospect(s) correspondant aux filtres`}
              description={`${fmtInt(run.total_found)} établissements trouvés · ${fmtInt(run.new_count)} nouveaux · ${fmtInt(run.merge_pending_count)} doublon(s) potentiel(s) à vérifier`}
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex rounded-lg border border-border p-0.5">
                    <button onClick={() => setView('table')} className={`rounded-md p-1.5 ${view === 'table' ? 'bg-panel-2' : 'text-muted'}`} aria-label="Vue tableau" aria-pressed={view==='table'}><List className="size-4" /></button>
                    <button onClick={() => setView('map')} className={`rounded-md p-1.5 ${view === 'map' ? 'bg-panel-2' : 'text-muted'}`} aria-label="Vue carte" aria-pressed={view==='map'}><MapIcon className="size-4" /></button>
                  </div>
                  <Button size="sm" variant="outline" onClick={async () => { const all = await api<{ rows: { id: string }[] }>(`/api/prospects?${filterQs.replace(/page=\d+&pageSize=50/, 'page=1&pageSize=500')}`); sel.setMany(all.rows.map((r) => r.id), true); toast.success(`${all.rows.length} prospect(s) sélectionné(s)`) }}>Tout sélectionner</Button>
                  <Button size="sm" variant="outline" asChild><a href={`/api/prospects/export?${filterQs}`}><Download />CSV</a></Button>
                </div>
              }
            />
            <SourceReports reports={run.source_reports} />
            {view === 'map' ? (
              <div className="p-4">
                <ProspectMap
                  points={(mapQ.data?.rows ?? []).filter((r) => r.lat != null && r.lon != null).map((r) => ({ id: r.id, name: r.name, lat: r.lat!, lon: r.lon!, score: r.score, presence: r.web_presence_status }))}
                  center={run.params.resolvedLat != null ? [run.params.resolvedLat, run.params.resolvedLon!] : null}
                  radiusKm={Number(run.params.radiusKm)}
                />
              </div>
            ) : results.isLoading ? (
              <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : results.isError ? (<div className="p-6"><Notice tone="danger" title="Les résultats ne sont pas disponibles"><Button size="sm" variant="outline" onClick={()=>results.refetch()}>Réessayer</Button></Notice></div>) : results.data?.rows.length ? (
              <>
                <ProspectTable rows={results.data.rows} />
                <Pager page={page} total={results.data.total} pageSize={50} onPage={setPage} />
              </>
            ) : (
              <EmptyState title="Aucun prospect ne correspond aux filtres" description="Élargissez le rayon ou changez le filtre de présence web." />
            )}
          </Card>
        )}
      </div>
      <SaveDialog open={saveOpen} onOpenChange={setSaveOpen} params={params()} />
    </div>
  )
}

function SourceReports({ reports }: { reports: RunInfo['run']['source_reports'] }) {
  const rs = reports.filter((r) => r.source)
  if (!rs.length) return null
  return (
    <div className="flex flex-wrap gap-2 border-b border-border px-5 py-2.5">
      {rs.map((r) => (
        <span key={r.source} title={r.message} className="inline-flex items-center gap-1 text-xs text-muted">
          {r.status === 'ok' ? <CheckCircle2 className="size-3.5 text-success" /> : r.status === 'skipped' ? <CircleDashed className="size-3.5" /> : <XCircle className="size-3.5 text-danger" />}
          {r.source} {r.status === 'ok' ? `(${r.count}, ${((r.ms ?? 0) / 1000).toFixed(1)} s)` : `— ${r.message ?? r.status}`}
        </span>
      ))}
    </div>
  )
}

function RunProgress({ info }: { info: RunInfo }) {
  const { run, logs, workersOnline } = info
  const failed = run.status === 'FAILED' || run.job_status === 'FAILED'
  return (
    <Card>
      <CardHeader title={failed ? 'La recherche a échoué' : 'Recherche en cours…'} description={run.progress_message ?? (run.job_status === 'PENDING' ? 'En attente d’un worker' : '')} />
      <CardBody className="space-y-4">
        {!failed && !workersOnline ? <Notice tone="warning" title="Le traitement n’a pas encore démarré">Le traitement attend le moteur de recherche. Vérifiez que l’application est bien lancée, puis consultez <Link href="/settings?tab=infra" className="underline">son état</Link>.</Notice> : null}
        {failed ? <Notice tone="danger">{run.error ?? run.job_error}</Notice> : (
          <div className="h-2 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-label="Progression de la recherche" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((run.progress??0)*100)}><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(4, (run.progress ?? 0) * 100)}%` }} /></div>
        )}
        <details className="ui-details"><summary>Voir les détails du traitement</summary><ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-[11px] text-muted">
          {logs.map((l, i) => <li key={i} className={l.level === 'warn' || l.level === 'error' ? 'text-warning' : ''}>{new Date(l.created_at).toLocaleTimeString('fr-FR')} · {l.message}</li>)}
          {!failed ? <li className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" />…</li> : null}
        </ul></details>
      </CardBody>
    </Card>
  )
}

function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
      <span>Page {page} / {pages}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant</Button>
      </div>
    </div>
  )
}

function SavedSearches({ onOpenRun }: { onOpenRun: (id: string) => void }) {
  const qc = useQueryClient()
  const saved = useQuery({ queryKey: ['saved'], queryFn: () => api<{ id: string; name: string; schedule: { cron: string; enabled: boolean; next_run_at: string } | null; last_run: { id: string; status: string; total_found: number; new_count: number; created_at: string } | null }[]>('/api/saved-searches') })
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api<{ id: string; params: { city?: string; sector?: string; radiusKm?: number }; status: string; total_found: number; new_count: number; created_at: string; saved_name: string | null }[]>('/api/search/runs') })
  return (
    <Card>
      <CardHeader title="Recherches enregistrées & historique" />
      <div className="divide-y divide-border text-xs">
        {saved.data?.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-medium">{s.name}</p>
              <p className="text-muted">{s.schedule ? `Automatique (${s.schedule.cron}) · prochaine ${fmtRelative(s.schedule.next_run_at)}` : 'Manuelle'}{s.last_run ? ` · dernière : ${s.last_run.total_found} trouvés, +${s.last_run.new_count}` : ''}</p>
            </div>
            <div className="flex gap-1">
              {s.last_run ? <Button size="sm" variant="ghost" onClick={() => onOpenRun(s.last_run!.id)}>Voir</Button> : null}
              <Button size="icon" variant="ghost" aria-label="Supprimer" onClick={async () => { if (!confirm('Supprimer cette recherche et sa planification ?')) return; await api(`/api/saved-searches/${s.id}`, { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['saved'] }) }}><Trash2 /></Button>
            </div>
          </div>
        ))}
        {runs.data?.slice(0, 10).map((r) => (
          <button key={r.id} onClick={() => onOpenRun(r.id)} className="flex w-full items-center justify-between gap-2 px-5 py-2.5 text-left hover:bg-panel-2">
            <span className="min-w-0 truncate">{r.saved_name ?? [r.params.sector, r.params.city, r.params.radiusKm ? `${r.params.radiusKm} km` : null].filter(Boolean).join(' · ')}</span>
            <span className="shrink-0 text-muted">{r.status === 'COMPLETED' ? `${r.total_found} · +${r.new_count}` : r.status} · {fmtRelative(r.created_at)}</span>
          </button>
        ))}
        {!saved.data?.length && !runs.data?.length ? <p className="px-5 py-4 text-muted">Aucune recherche pour l’instant.</p> : null}
      </div>
    </Card>
  )
}

function SaveDialog({ open, onOpenChange, params }: { open: boolean; onOpenChange: (o: boolean) => void; params: Record<string, unknown> }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Enregistrer la recherche" description="Optionnel : planifiez-la pour détecter automatiquement les nouveaux établissements.">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          setBusy(true)
          try {
            const freq = String(fd.get('freq'))
            const cron = freq === 'daily' ? '0 7 * * *' : freq === 'weekly' ? '0 7 * * 1' : freq === 'custom' ? String(fd.get('cron')) : null
            await api('/api/saved-searches', { method: 'POST', json: { name: fd.get('name'), params, cron } })
            toast.success('Recherche enregistrée')
            qc.invalidateQueries({ queryKey: ['saved'] })
            onOpenChange(false)
          } catch (err) {
            toast.error((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="Nom"><Input name="name" required placeholder="Coiffeurs Rouen 10 km" /></Field>
        <Field label="Exécution automatique">
          <Select name="freq" defaultValue="none">
            <option value="none">Manuelle uniquement</option>
            <option value="daily">Chaque jour (7 h)</option>
            <option value="weekly">Chaque lundi (7 h)</option>
            <option value="custom">Expression cron…</option>
          </Select>
        </Field>
        <Field label="Cron (si personnalisé)" hint="Minute heure jour mois jour-semaine — intervalle minimal 15 min"><Input name="cron" placeholder="0 6 * * 1-5" /></Field>
        <Button type="submit" loading={busy}>Enregistrer</Button>
      </form>
    </Dialog>
  )
}
