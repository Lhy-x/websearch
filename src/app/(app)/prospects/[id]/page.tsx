import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader, EmptyState, Notice, Table, Td, Th } from '@/components/ui/primitives'
import { NextAction } from '@/components/workflow'
import { EmailBadge, PipelineBadge, PresenceBadge, ScorePill } from '@/components/badges'
import { getBusinessDetail } from '@/server/business/detail'
import { getPreviewBaseUrl, getSettings } from '@/server/core/settings'
import { previewUrl } from '@/server/proposals/service'
import { SECTOR_BY_ID } from '@/lib/sectors'
import { MSG_STATUS, CLASSIFICATION } from '@/lib/labels'
import { formatPhone } from '@/lib/phone'
import { fmtDate, fmtUsd } from '@/lib/utils'
import { ProspectActions, ContactActions, NotesTasks, Opportunities, MergeReview, EditProspect } from './actions'
import { ProposalViewer } from './proposal-viewer'
import { ProspectCreativeBrief } from '@/components/prospect-creative-brief'
import { sql } from '@/server/core/db'

export const dynamic = 'force-dynamic'

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await getBusinessDetail(id)
  if (!d) notFound()
  const settings = await getSettings()
  const [brief]=await sql()`select value from business_enrichments where business_id=${id} and field='site_brief' and source='manual'`
  const previewBase=await getPreviewBaseUrl(settings)
  const b = d.business as Record<string, unknown> & { id: string; name: string; sector: string | null; city: string | null; postcode: string | null; address: string | null; country: string | null; phone: string | null; email: string | null; email_status: string; website_url: string | null; web_presence_status: string; pipeline_status: string; score: number | null; data_confidence: number | null; priority: string | null; tags: string[]; siret: string | null; naf_code: string | null; lat: number | null; lon: number | null; do_not_contact: boolean; web_presence_evidence: { source: string; at: string; finding: string; live?: boolean; detail?: string }[]; merged_into: string | null; created_at: Date; enriched_at: Date | null }
  const latestScore = d.scores[0] as { score: number; confidence: number; priority: string; reasons: { label: string; points: number }[]; created_at: Date } | undefined
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted"><Link href="/prospects" className="hover:text-fg">Base de prospects</Link> / fiche</p>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-medium tracking-tight">
            {b.name} <ScorePill score={b.score} priority={b.priority} /> <PipelineBadge status={b.pipeline_status} />
            {b.do_not_contact ? <Badge tone="danger">Ne pas contacter</Badge> : null}
          </h1>
          <p className="mt-1 text-sm text-muted">{[b.sector ? SECTOR_BY_ID.get(b.sector)?.label : null, b.address, [b.postcode, b.city].filter(Boolean).join(' '), b.country].filter(Boolean).join(' · ')}</p>
          {b.merged_into ? <p className="mt-1 text-xs text-warning">Fiche fusionnée dans <Link className="underline" href={`/prospects/${b.merged_into}`}>une autre fiche</Link>.</p> : null}
        </div>
        <ProspectActions id={b.id} status={b.pipeline_status} sites={(d.sites as unknown as { id: string; status: string }[]).filter((s) => s.status === 'READY').map((s) => s.id)} />
      </div>

      <NextAction title={d.sites.length?'Votre démo est prête à être relue.':'Donnez une nouvelle dimension à cette entreprise.'} description={d.sites.length?'Ouvrez le site, ajustez-le si besoin, puis préparez votre email.':'Vérifiez ses informations, puis lancez la création de son site personnalisé.'} href={d.sites.length?`/sites/${d.sites[0]!.id}`:`/generator?business=${b.id}`} action={d.sites.length?'Ouvrir la démo':'Créer son site'}/>
      {d.merges.length ? <MergeReview id={b.id} merges={d.merges as never} /> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <ProspectCreativeBrief id={id} initial={brief?.value??{}}/>
          <Card>
            <CardHeader title="Identité & coordonnées" description="Chaque valeur indique sa source et son statut de vérification." actions={<EditProspect business={{ id: b.id, name: b.name, sector: b.sector, address: b.address, postcode: b.postcode, city: b.city, phone: b.phone, tags: b.tags }} />} />
            <CardBody className="grid gap-4 text-sm md:grid-cols-2">
              <Info label="Téléphone principal" value={b.phone ? formatPhone(b.phone) : null} />
              <Info label="Email principal" value={b.email ? <span className="flex flex-wrap items-center gap-1.5">{b.email}<EmailBadge status={b.email_status} /></span> : null} />
              <Info label="Site web" value={b.website_url ? <a className="inline-flex items-center gap-1 text-primary" href={b.website_url} target="_blank" rel="noopener noreferrer nofollow">{b.website_url}<ExternalLink className="size-3" /></a> : null} />
              <Info label="Présence web" value={<PresenceBadge status={b.web_presence_status} />} />
              <Info label="SIRET / NAF" value={b.siret ? `${b.siret}${b.naf_code ? ' · ' + b.naf_code : ''}` : null} />
              <Info label="Tags" value={b.tags.length ? <span className="flex flex-wrap gap-1">{b.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : null} />
              <Info label="Créé le" value={fmtDate(b.created_at)} />
              <Info label="Enrichi le" value={b.enriched_at ? fmtDate(b.enriched_at) : 'Jamais'} />
            </CardBody>
            <div className="border-t border-border">
              <Table>
                <thead><tr><Th>Type</Th><Th>Valeur</Th><Th>Source</Th><Th>Statut</Th><Th>Récupéré / vérifié</Th><Th /></tr></thead>
                <tbody>
                  {(d.contacts as unknown as { id: string; kind: string; value: string; normalized_value: string; label: string | null; source: string; source_url: string | null; status: string; mx_valid: boolean | null; is_role_account: boolean | null; is_primary: boolean; opted_out: boolean; retrieved_at: Date; verified_at: Date | null }[]).map((c) => (
                    <tr key={c.id}>
                      <Td className="text-xs text-muted">{c.kind}{c.label ? ` · ${c.label}` : ''}{c.is_primary ? ' ★' : ''}</Td>
                      <Td className="max-w-[220px] truncate text-xs" title={c.normalized_value}>{c.kind === 'phone' ? formatPhone(c.normalized_value) : c.normalized_value}{c.opted_out ? <Badge tone="danger" className="ml-1">opposition</Badge> : null}</Td>
                      <Td className="text-xs">{c.source_url ? <a className="text-primary" href={c.source_url} target="_blank" rel="noopener noreferrer nofollow">{c.source}</a> : c.source}</Td>
                      <Td className="text-xs">
                        <EmailBadge status={c.status} />
                        {c.kind === 'email' ? <span className="ml-1 text-muted">MX : {c.mx_valid === null ? 'non testé' : c.mx_valid ? 'ok' : 'absent'}</span> : null}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-muted">{fmtDate(c.retrieved_at, false)}<br />{c.verified_at ? fmtDate(c.verified_at, false) : 'non vérifié'}</Td>
                      <Td><ContactActions businessId={b.id} contactId={c.id} status={c.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className="px-5 py-2 text-[11px] text-muted">« MX ok » signifie que le domaine accepte des emails ; cela ne prouve pas que la boîte existe.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Vérification de la présence web" description="Une absence de site n’est « confirmée » qu’avec au moins deux sources indépendantes dont une vérification en direct, ou une confirmation manuelle." />
            <CardBody className="space-y-2">
              {b.web_presence_evidence.length ? b.web_presence_evidence.map((e, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={e.finding === 'website_listed' || e.finding === 'manual_website' ? 'info' : 'neutral'}>{e.source}</Badge>
                  <span>{{ website_listed: 'site référencé', no_website: 'aucun site', third_party_only: 'uniquement annuaire / réseau social', manual_no_website: 'absence confirmée manuellement', manual_website: 'site ajouté manuellement' }[e.finding] ?? e.finding}</span>
                  {e.live ? <Badge tone="success">vérification en direct</Badge> : null}
                  <span className="text-muted">{fmtDate(e.at)}{e.detail ? ` — ${e.detail}` : ''}</span>
                </div>
              )) : <p className="text-xs text-muted">Aucune observation.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Audits du site existant" />
            {d.audits.length ? (
              <div className="divide-y divide-border">
                {(d.audits as unknown as { id: string; url: string; final_url: string | null; http_status: number | null; https_ok: boolean | null; load_ms: number | null; has_viewport: boolean | null; mobile_overflow: boolean | null; title: string | null; issues: { label: string; severity: string }[]; quality_score: number | null; verdict: string | null; screenshot_desktop: string | null; screenshot_mobile: string | null; error: string | null; created_at: Date }[]).map((a) => (
                  <div key={a.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2 text-xs">
                      <p className="text-sm font-medium">{a.final_url ?? a.url} <span className="text-muted">— qualité {a.quality_score ?? '—'}/100 · {fmtDate(a.created_at)}</span></p>
                      <p className="text-muted">HTTP {a.http_status ?? '—'} · HTTPS {a.https_ok ? 'oui' : 'non'} · {a.load_ms ? `${(a.load_ms / 1000).toFixed(1)} s` : '—'} · viewport {a.has_viewport ? 'oui' : 'non'} · débordement mobile {a.mobile_overflow == null ? '—' : a.mobile_overflow ? 'oui' : 'non'}</p>
                      {a.error ? <Notice tone="danger">{a.error}</Notice> : null}
                      <ul className="space-y-1">{a.issues.map((i, k) => <li key={k} className="flex gap-2"><Badge tone={i.severity === 'high' ? 'danger' : i.severity === 'medium' ? 'warning' : 'neutral'}>{i.severity}</Badge>{i.label}</li>)}</ul>
                    </div>
                    <div className="flex gap-2">
                      {a.screenshot_desktop ? <a href={`/api/files/${a.screenshot_desktop}`} target="_blank"><img src={`/api/files/${a.screenshot_desktop}`} alt="Capture desktop" className="h-28 rounded-md border border-border object-cover" /></a> : null}
                      {a.screenshot_mobile ? <a href={`/api/files/${a.screenshot_mobile}`} target="_blank"><img src={`/api/files/${a.screenshot_mobile}`} alt="Capture mobile" className="h-28 rounded-md border border-border object-cover" /></a> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="Aucun audit" description={b.website_url ? 'Lancez un audit depuis le menu Actions.' : 'Aucun site propre connu à auditer.'} />}
          </Card>

          <div id="demos" className="scroll-mt-5"><Card>
            <CardHeader title="Démonstrations générées" actions={<Link href={`/generator?business=${b.id}`} className="text-xs text-primary">Générer une variante</Link>} />
            {d.sites.length ? (
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {(d.sites as unknown as { id: string; template_id: string; style: string; status: string; current_version: number | null; preview_token: string; preview_enabled: boolean; generator: string | null; model: string | null; cost_usd: string; view_count: number; error: string | null; created_at: Date; thumbnail: string | null }[]).map((s) => (
                  <div key={s.id} className="overflow-hidden rounded-lg border border-border">
                    {s.thumbnail ? <img src={`/api/files/${s.thumbnail}`} alt="" className="aspect-[16/10] w-full object-cover" /> : <div className="grid aspect-[16/10] place-items-center bg-panel-2 text-xs text-muted">{s.status === 'READY' ? 'Capture en attente' : s.status}</div>}
                    <div className="space-y-1 p-3 text-xs">
                      <p className="font-medium">Version {s.current_version??'—'} <Badge tone={s.status === 'READY' ? 'success' : s.status === 'ERROR' ? 'danger' : 'neutral'}>{{READY:'Prête',GENERATING:'En création',ERROR:'À reprendre',DISABLED:'Désactivée'}[s.status]??s.status}</Badge></p>
                      <p className="text-muted">{s.view_count} vue(s) · Site personnalisé</p>
                      {s.error ? <p className="text-danger">{s.error}</p> : null}
                      <div className="flex gap-3 pt-1">
                        <Link className="text-primary" href={`/sites/${s.id}`}>Éditer</Link>
                        {s.status === 'READY' && s.preview_enabled ? <a className="text-primary" href={previewUrl(s.preview_token, previewBase)} target="_blank" rel="noopener noreferrer">Prévisualiser</a> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="Aucune démonstration" description="Actions → Générer un site." />}
          </Card></div>

          <ProposalViewer proposals={d.proposals as never} />

          <Card>
            <CardHeader title="Emails & conversations" />
            {d.outbound.length || d.inbound.length ? (
              <ul className="divide-y divide-border text-xs">
                {[
                  ...(d.outbound as unknown as { id: string; campaign_name: string | null; step: number; to_email: string; subject: string; status: string; sent_at: Date | null; scheduled_at: Date | null; last_error: string | null }[]).map((o) => ({ at: o.sent_at ?? o.scheduled_at, k: 'out' as const, o })),
                  ...(d.inbound as unknown as { id: string; conversation_id: string; from_email: string; subject: string; received_at: Date; classification: string; summary: string | null }[]).map((i) => ({ at: i.received_at, k: 'in' as const, i })),
                ]
                  .sort((x, y) => new Date(y.at ?? 0).getTime() - new Date(x.at ?? 0).getTime())
                  .map((e) =>
                    e.k === 'out' ? (
                      <li key={e.o.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                        <Badge tone={MSG_STATUS[e.o.status]?.tone}>{MSG_STATUS[e.o.status]?.label ?? e.o.status}</Badge>
                        <span className="font-medium">→ {e.o.subject}</span>
                        <span className="text-muted">{e.o.campaign_name ? `${e.o.campaign_name} · étape ${e.o.step + 1}` : 'hors campagne'} · {fmtDate(e.at)}</span>
                        {e.o.last_error ? <span className="text-danger">{e.o.last_error}</span> : null}
                      </li>
                    ) : (
                      <li key={e.i.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                        <Badge tone={CLASSIFICATION[e.i.classification]?.tone}>{CLASSIFICATION[e.i.classification]?.label ?? e.i.classification}</Badge>
                        <Link href={`/inbox?c=${e.i.conversation_id}`} className="font-medium hover:text-primary">← {e.i.subject || '(sans objet)'}</Link>
                        <span className="text-muted">{e.i.from_email} · {fmtDate(e.at)}</span>
                        {e.i.summary ? <span className="w-full text-muted">{e.i.summary}</span> : null}
                      </li>
                    ),
                  )}
              </ul>
            ) : <EmptyState title="Aucun échange" />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={`Score ${latestScore?.score ?? '—'}/100`} description={latestScore ? `Confiance des données ${latestScore.confidence}/100 · priorité ${latestScore.priority}` : 'Non calculé'} />
            <CardBody>
              <ul className="space-y-1.5 text-xs">
                {latestScore?.reasons.map((r, i) => (
                  <li key={i} className="flex justify-between gap-3"><span>{r.label}</span><span className={`tabular font-medium ${r.points > 0 ? 'text-success' : r.points < 0 ? 'text-danger' : 'text-muted'}`}>{r.points > 0 ? '+' : ''}{r.points}</span></li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted">Score déterministe — pondérations dans Paramètres → Scoring.</p>
            </CardBody>
          </Card>
          <Opportunities businessId={b.id} opps={d.opps as never} />
          <NotesTasks businessId={b.id} notes={d.notes as never} tasks={d.tasks as never} />
          <Card>
            <CardHeader title="Sources" />
            <ul className="divide-y divide-border text-xs">
              {(d.sources as unknown as { source: string; source_record_id: string; source_release: string | null; confidence: number | null; license: string | null; fetched_at: Date }[]).map((s) => (
                <li key={s.source + s.source_record_id} className="px-5 py-2.5">
                  <p className="font-medium">{s.source}{s.source_release ? ` · ${s.source_release}` : ''}</p>
                  <p className="truncate text-muted">{s.source_record_id} · confiance {s.confidence != null ? s.confidence.toFixed(2) : '—'}</p>
                  <p className="text-muted">{s.license} · {fmtDate(s.fetched_at)}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Historique" />
            <ul className="max-h-96 divide-y divide-border overflow-y-auto text-xs">
              {(d.timeline as unknown as { action: string; actor: string; data: unknown; created_at: Date }[]).map((t, i) => (
                <li key={i} className="px-5 py-2"><span className="font-medium">{t.action}</span> <span className="text-muted">· {t.actor} · {fmtDate(t.created_at)}</span></li>
              ))}
              {!d.timeline.length ? <li className="px-5 py-3 text-muted">Aucun événement.</li> : null}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-0.5">{value ?? <span className="text-muted">—</span>}</div>
    </div>
  )
}

