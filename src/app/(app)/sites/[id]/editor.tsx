'use client'
import { ArrowDown, ArrowUp, Download, ExternalLink, Eye, EyeOff, Monitor, Plus, RotateCcw, Save, Smartphone, Trash2, Camera } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, Field, Input, Notice, Select, Textarea } from '@/components/ui/primitives'
import { useJobRunner } from '@/components/use-job'
import { ICONS, STYLES, type Section, type SiteConfig } from '@/lib/site/schema'
import { TEMPLATES, TEMPLATE_BY_ID } from '@/lib/site/templates'
import { FONT_PAIRS, applyStyle } from '@/lib/site/themes'
import { buildNavigation } from '@/lib/site/build'
import { api, fmtDate } from '@/lib/utils'

interface Props {
  site: { id: string; business_id: string; business_name: string; status: string; preview_enabled: boolean; preview_expires_at: string | null; generator: string | null; model: string | null; error: string | null; previewUrl: string }
  initial: { version: number; config: SiteConfig } | null
  versions: { version: number; created_by: string; note: string | null; created_at: string }[]
  shots: { kind: string; path: string; version: number }[]
}

const SECTION_LABELS: Record<Section['type'], string> = { about: 'Présentation', services: 'Prestations', benefits: 'Avantages', process: 'Méthode', gallery: 'Galerie', hours: 'Horaires', area: 'Zone', faq: 'FAQ', cta: 'Appel à l’action', contact: 'Contact' }

export function Editor({ site, initial, versions, shots }: Props) {
  const router = useRouter()
  const runJob = useJobRunner()
  const [cfg, setCfg] = useState<SiteConfig | null>(initial?.config ?? null)
  const [base, setBase] = useState(initial?.version ?? 0)
  const [dirty, setDirty] = useState(false)
  const [html, setHtml] = useState('')
  const [renderError, setRenderError] = useState<string | null>(null)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = (fn: (c: SiteConfig) => void) => {
    setCfg((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      fn(next)
      next.navigation = buildNavigation(next.sections)
      return next
    })
    setDirty(true)
  }

  useEffect(() => {
    if (!cfg) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const res = await fetch('/api/sites/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) })
      if (res.ok) {
        setHtml(await res.text())
        setRenderError(null)
      } else {
        const e = (await res.json().catch(() => ({}))) as { error?: string; issues?: { path: string; message: string }[] }
        setRenderError(`${e.error ?? 'Erreur'}${e.issues ? ' — ' + e.issues.map((i) => `${i.path}: ${i.message}`).join(' ; ') : ''}`)
      }
    }, 350)
  }, [cfg])

  const save = async () => {
    if (!cfg) return
    setSaving(true)
    try {
      const r = await api<{ version: number }>(`/api/sites/${site.id}`, { method: 'PUT', json: { config: cfg, baseVersion: base } })
      setBase(r.version)
      setDirty(false)
      toast.success(`Version ${r.version} enregistrée`)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const action = async (json: Record<string, unknown>, ok?: string) => {
    try {
      const r = await api<{ version?: number }>(`/api/sites/${site.id}`, { method: 'POST', json })
      if (ok) toast.success(ok)
      router.refresh()
      return r
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const fontIdx = useMemo(() => (cfg ? FONT_PAIRS.findIndex((p) => p.heading === cfg.theme.headingFont && p.body === cfg.theme.bodyFont) : -1), [cfg])

  if (!cfg) return <Notice tone="danger" title="Aucune version disponible">{site.error ?? 'La génération a échoué.'}</Notice>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted"><Link href="/sites" className="hover:text-fg">Sites générés</Link> / <Link href={`/prospects/${site.business_id}`} className="hover:text-fg">{site.business_name}</Link></p>
          <h1 className="text-lg font-semibold">Éditeur — v{base}{dirty ? <Badge tone="warning" className="ml-2">modifications non enregistrées</Badge> : null}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href={site.previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />Démo publique</a></Button>
          <Button variant="outline" onClick={() => action({ action: 'preview', enabled: !site.preview_enabled }, site.preview_enabled ? 'Démo désactivée' : 'Démo réactivée')}>{site.preview_enabled ? <><EyeOff />Désactiver la démo</> : <><Eye />Activer la démo</>}</Button>
          <Button variant="outline" onClick={async () => {
            const res = await fetch(`/api/sites/${site.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'export', includeMedia: true }) })
            if (!res.ok) return toast.error('Export impossible')
            const warnings = decodeURIComponent(res.headers.get('x-export-warnings') ?? '')
            const blob = await res.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'site.zip'
            a.click()
            if (warnings) toast.warning(warnings)
          }}><Download />Export ZIP</Button>
          <Button onClick={save} loading={saving} disabled={!dirty || !!renderError}><Save />Enregistrer</Button>
        </div>
      </div>
      <p className="text-xs text-muted">Généré par {site.generator ?? '—'}{site.model ? ` (${site.model})` : ''} · démo {site.preview_enabled ? 'active' : 'désactivée'}{site.preview_expires_at ? `, expire le ${fmtDate(site.preview_expires_at, false)}` : ''} <button className="text-primary" onClick={() => action({ action: 'extend', days: 30 }, 'Démo prolongée de 30 jours')}>Prolonger de 30 j</button></p>
      {renderError ? <Notice tone="danger" title="Configuration invalide">{renderError}</Notice> : null}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Design" />
            <CardBody className="space-y-3">
              <Field label="Expérience"><Select value={cfg.glass3d ? 'glass3d' : 'static'} onChange={(e) => update(c => { if (e.target.value === 'glass3d') c.glass3d = { shape: 'spark' }; else delete c.glass3d })}><option value="static">Site classique</option><option value="glass3d">3D Glass interactive</option></Select></Field>
              {cfg.glass3d ? <Field label="Objet 3D"><Select value={cfg.glass3d.shape} onChange={(e) => update(c => { c.glass3d = { shape: e.target.value as NonNullable<SiteConfig['glass3d']>['shape'] } })}>{Object.entries({spark:'Étoile',cloud:'Nuage',bolt:'Éclair',home:'Maison',cross:'Croix',bloom:'Fleur',shield:'Bouclier',gear:'Engrenage',prism:'Prisme',ring:'Anneau',code:'Code',palette:'Palette'}).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Select></Field> : null}
              {cfg.glass3d ? <Notice tone="info" title="Scène cinématique">Présentation et premières prestations dans la scène ; tous les textes restent accessibles dans « Toutes les informations ». Principale et Accent pilotent le verre et le fond. La scène utilise Space Grotesk.</Notice> : null}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Template">
                  <Select value={cfg.templateId} onChange={(e) => update((c) => { const t = TEMPLATE_BY_ID.get(e.target.value)!; c.templateId = t.id; c.layout = t.layout; c.theme = applyStyle(t.theme, c.style) })}>
                    {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
                <Field label="Style">
                  <Select value={cfg.style} onChange={(e) => update((c) => { c.style = e.target.value as SiteConfig['style']; c.theme = applyStyle({ ...c.theme }, c.style) })}>
                    {STYLES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['primary', 'accent', 'background', 'surface', 'text', 'muted'] as const).map((k) => (
                  <label key={k} className="text-[11px] text-muted">
                    {{ primary: 'Principale', accent: 'Accent', background: 'Fond', surface: 'Surface', text: 'Texte', muted: 'Secondaire' }[k]}
                    <input type="color" value={cfg.theme[k]} onChange={(e) => update((c) => { c.theme[k] = e.target.value })} className="mt-1 block h-8 w-full cursor-pointer rounded-md border border-border bg-panel" />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Typographies">
                  <Select value={fontIdx} onChange={(e) => update((c) => { const p = FONT_PAIRS[Number(e.target.value)]!; c.theme.headingFont = p.heading; c.theme.bodyFont = p.body })}>
                    {fontIdx < 0 ? <option value={-1}>{cfg.theme.headingFont} / {cfg.theme.bodyFont}</option> : null}
                    {FONT_PAIRS.map((p, i) => <option key={i} value={i}>{p.heading} / {p.body}</option>)}
                  </Select>
                </Field>
                <Field label="Boutons"><Select value={cfg.theme.buttonStyle} onChange={(e) => update((c) => { c.theme.buttonStyle = e.target.value as SiteConfig['theme']['buttonStyle'] })}><option value="solid">Pleins</option><option value="outline">Contour</option><option value="pill">Pilule</option></Select></Field>
                <Field label="Arrondis"><Select value={cfg.theme.radius} onChange={(e) => update((c) => { c.theme.radius = e.target.value as SiteConfig['theme']['radius'] })}>{['none', 'sm', 'md', 'lg', 'full'].map((r) => <option key={r}>{r}</option>)}</Select></Field>
                <Field label="Espacements"><Select value={cfg.theme.density} onChange={(e) => update((c) => { c.theme.density = e.target.value as SiteConfig['theme']['density'] })}><option value="compact">Compact</option><option value="comfortable">Confortable</option><option value="airy">Aéré</option></Select></Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="En-tête (hero)" />
            <CardBody className="space-y-3">
              <Field label="Accroche"><Input value={cfg.hero.eyebrow} maxLength={60} onChange={(e) => update((c) => { c.hero.eyebrow = e.target.value })} /></Field>
              <Field label="Titre"><Input value={cfg.hero.title} maxLength={120} onChange={(e) => update((c) => { c.hero.title = e.target.value })} /></Field>
              <Field label="Sous-titre"><Textarea rows={2} value={cfg.hero.subtitle} maxLength={300} onChange={(e) => update((c) => { c.hero.subtitle = e.target.value })} /></Field>
              {cfg.hero.primaryCta ? <Field label="Bouton principal" hint={cfg.hero.primaryCta.href}><Input value={cfg.hero.primaryCta.label} maxLength={40} onChange={(e) => update((c) => { c.hero.primaryCta!.label = e.target.value })} /></Field> : null}
              <Field label="Image d’en-tête">
                <Select value={cfg.hero.mediaId ?? ''} onChange={(e) => update((c) => { c.hero.mediaId = e.target.value || null })}>
                  <option value="">Illustration graphique (aucune photo)</option>
                  {cfg.media.map((m) => <option key={m.id} value={m.id}>{m.alt}</option>)}
                </Select>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Sections" description="Activer, réordonner et modifier" />
            <div className="divide-y divide-border">
              {cfg.sections.map((s, i) => (
                <details key={s.id} className="group">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm">
                    <input type="checkbox" checked={s.enabled} onClick={(e) => e.stopPropagation()} onChange={(e) => update((c) => { c.sections[i]!.enabled = e.target.checked })} aria-label={`Activer ${SECTION_LABELS[s.type]}`} />
                    <span className="flex-1">{SECTION_LABELS[s.type]} <span className="text-xs text-muted">— {s.title}</span></span>
                    <button type="button" aria-label="Monter" className="rounded p-1 text-muted hover:bg-panel-2 disabled:opacity-30" disabled={i === 0} onClick={(e) => { e.preventDefault(); update((c) => { const [x] = c.sections.splice(i, 1); c.sections.splice(i - 1, 0, x!) }) }}><ArrowUp className="size-3.5" /></button>
                    <button type="button" aria-label="Descendre" className="rounded p-1 text-muted hover:bg-panel-2 disabled:opacity-30" disabled={i === cfg.sections.length - 1} onClick={(e) => { e.preventDefault(); update((c) => { const [x] = c.sections.splice(i, 1); c.sections.splice(i + 1, 0, x!) }) }}><ArrowDown className="size-3.5" /></button>
                  </summary>
                  <div className="space-y-3 px-4 pb-4">
                    <SectionEditor section={s} media={cfg.media} onChange={(fn) => update((c) => fn(c.sections[i]!))} />
                  </div>
                </details>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 border-t border-border p-3">
              {(['about', 'services', 'benefits', 'process', 'gallery', 'area', 'faq', 'cta', 'contact'] as const).filter((t) => !cfg.sections.some((s) => s.type === t)).map((t) => (
                <Button key={t} size="sm" variant="ghost" onClick={() => update((c) => { c.sections.push(newSection(t, c)) })}><Plus />{SECTION_LABELS[t]}</Button>
              ))}
            </div>
          </Card>

          <MediaEditor cfg={cfg} update={update} />

          <Card>
            <CardHeader title="Référencement" />
            <CardBody className="space-y-3">
              <Field label={`Titre (${cfg.seo.title.length}/70)`}><Input value={cfg.seo.title} maxLength={70} onChange={(e) => update((c) => { c.seo.title = e.target.value })} /></Field>
              <Field label={`Description (${cfg.seo.description.length}/170)`}><Textarea rows={2} maxLength={170} value={cfg.seo.description} onChange={(e) => update((c) => { c.seo.description = e.target.value })} /></Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Historique des versions" />
            <ul className="divide-y divide-border text-xs">
              {versions.map((v) => (
                <li key={v.version} className="flex items-center justify-between px-4 py-2">
                  <span>v{v.version} · {v.created_by} · {fmtDate(v.created_at)}{v.note ? <span className="text-muted"> — {v.note}</span> : null}</span>
                  {v.version !== base ? <Button size="sm" variant="ghost" onClick={async () => { const r = await action({ action: 'restore', version: v.version }, `Version ${v.version} restaurée`); if (r?.version) location.reload() }}><RotateCcw />Restaurer</Button> : <Badge tone="primary">actuelle</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-lg border border-border bg-panel p-0.5">
              <button onClick={() => setDevice('desktop')} className={`rounded-md p-1.5 ${device === 'desktop' ? 'bg-panel-2' : 'text-muted'}`} aria-label="Ordinateur"><Monitor className="size-4" /></button>
              <button onClick={() => setDevice('mobile')} className={`rounded-md p-1.5 ${device === 'mobile' ? 'bg-panel-2' : 'text-muted'}`} aria-label="Mobile"><Smartphone className="size-4" /></button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              {shots.slice(0, 2).map((s) => <a key={s.path} href={`/api/files/${s.path}`} target="_blank" className="text-primary">{s.kind.replace('screenshot_', 'capture ')} v{s.version}</a>)}
              <Button size="sm" variant="ghost" onClick={() => runJob('Captures', () => api(`/api/sites/${site.id}`, { method: 'POST', json: { action: 'capture' } }))}><Camera />Recapturer</Button>
            </div>
          </div>
          <div className="grid place-items-center rounded-xl border border-border bg-panel-2 p-3">
            <iframe title="Aperçu du site" sandbox={cfg.glass3d ? "allow-scripts allow-popups" : ""} srcDoc={html} className="rounded-lg border border-border bg-white" style={{ width: device === 'mobile' ? 390 : '100%', height: '78vh' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function newSection(type: Section['type'], c: SiteConfig): Section {
  const base = { id: `${type}-${Math.random().toString(36).slice(2, 7)}`, enabled: true, intro: '' }
  switch (type) {
    case 'about': return { ...base, type, title: 'À propos', body: `${c.business.name}…` }
    case 'services': return { ...base, type, title: 'Prestations', items: [{ title: 'Prestation', description: '', indicative: true }], note: 'Liste indicative — à compléter avec l’établissement.' }
    case 'benefits': return { ...base, type, title: 'Nos atouts', items: [{ title: 'Atout', description: '' }] }
    case 'process': return { ...base, type, title: 'Comment ça se passe', items: [{ title: 'Étape', description: '' }] }
    case 'gallery': return { ...base, type, title: 'Galerie', mediaIds: c.media.map((m) => m.id) }
    case 'area': return { ...base, type, title: 'Zone & accès', body: c.business.city ? `Retrouvez-nous à ${c.business.city}.` : '', places: [] }
    case 'faq': return { ...base, type, title: 'Questions fréquentes', items: [{ q: 'Comment nous contacter ?', a: 'Nos coordonnées sont en bas de page.' }] }
    case 'cta': return { ...base, type, title: 'Parlons de votre besoin', body: 'Contactez-nous.', cta: c.hero.primaryCta ?? { label: 'Contact', href: '#contact' } }
    case 'contact': return { ...base, type, title: 'Contact' }
    case 'hours': return { ...base, type, title: 'Horaires', lines: [], source: '' }
  }
}

function SectionEditor({ section: s, media, onChange }: { section: Section; media: SiteConfig['media']; onChange: (fn: (s: Section) => void) => void }) {
  const items = 'items' in s ? s.items : null
  return (
    <>
      <Field label="Titre"><Input value={s.title} maxLength={100} onChange={(e) => onChange((x) => { x.title = e.target.value })} /></Field>
      {s.type !== 'contact' && s.type !== 'cta' ? <Field label="Introduction"><Textarea rows={2} maxLength={400} value={s.intro} onChange={(e) => onChange((x) => { x.intro = e.target.value })} /></Field> : null}
      {s.type === 'about' || s.type === 'area' || s.type === 'cta' ? <Field label="Texte"><Textarea rows={4} maxLength={s.type === 'about' ? 1500 : 600} value={s.body} onChange={(e) => onChange((x) => { (x as { body: string }).body = e.target.value })} /></Field> : null}
      {s.type === 'hours' ? <Notice tone="info">Horaires issus de la source « {s.source} » — non modifiables ici (faits vérifiés).</Notice> : null}
      {s.type === 'gallery' ? (
        <Field group label="Images affichées" hint="Ajoutez des médias sous licence dans le bloc Médias.">
          <div className="space-y-1">{media.map((m) => <label key={m.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={s.mediaIds.includes(m.id)} onChange={(e) => onChange((x) => { const g = x as { mediaIds: string[] }; g.mediaIds = e.target.checked ? [...g.mediaIds, m.id] : g.mediaIds.filter((id) => id !== m.id) })} />{m.alt}</label>)}</div>
        </Field>
      ) : null}
      {s.type === 'faq' ? (
        <div className="space-y-2">
          {s.items.map((it, k) => (
            <div key={k} className="space-y-1 rounded-lg border border-border p-2">
              <Input value={it.q} maxLength={160} placeholder="Question" onChange={(e) => onChange((x) => { (x as typeof s).items[k]!.q = e.target.value })} />
              <Textarea rows={2} value={it.a} maxLength={500} placeholder="Réponse" onChange={(e) => onChange((x) => { (x as typeof s).items[k]!.a = e.target.value })} />
              <Button size="sm" variant="ghost" onClick={() => onChange((x) => { (x as typeof s).items.splice(k, 1) })}><Trash2 />Retirer</Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => onChange((x) => { (x as typeof s).items.push({ q: '', a: '' }) })}><Plus />Question</Button>
        </div>
      ) : null}
      {items && s.type !== 'faq' ? (
        <div className="space-y-2">
          {s.type === 'services' ? <Notice tone="warning">Prestations indicatives : à valider avec l’établissement avant toute mise en ligne définitive.</Notice> : null}
          {(items as { title: string; description: string; icon?: string }[]).map((it, k) => (
            <div key={k} className="space-y-1 rounded-lg border border-border p-2">
              <div className="flex gap-1">
                <Input value={it.title} maxLength={80} onChange={(e) => onChange((x) => { ((x as { items: { title: string }[] }).items[k]!).title = e.target.value })} />
                <Select className="w-28" value={it.icon ?? 'check'} onChange={(e) => onChange((x) => { ((x as { items: { icon?: string }[] }).items[k]!).icon = e.target.value })} aria-label="Icône">{ICONS.map((ic) => <option key={ic}>{ic}</option>)}</Select>
              </div>
              <Textarea rows={2} maxLength={300} value={it.description} onChange={(e) => onChange((x) => { ((x as { items: { description: string }[] }).items[k]!).description = e.target.value })} />
              <Button size="sm" variant="ghost" onClick={() => onChange((x) => { (x as { items: unknown[] }).items.splice(k, 1) })}><Trash2 />Retirer</Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => onChange((x) => { (x as { items: unknown[] }).items.push(s.type === 'services' ? { title: 'Prestation', description: '', icon: 'check', indicative: true } : { title: 'Élément', description: '', icon: 'check' }) })}><Plus />Ajouter</Button>
        </div>
      ) : null}
    </>
  )
}

function MediaEditor({ cfg, update }: { cfg: SiteConfig; update: (fn: (c: SiteConfig) => void) => void }) {
  return (
    <Card>
      <CardHeader title="Médias" description="Uniquement des images dont vous détenez les droits (licence obligatoire). Aucune photo n’est générée ni présentée comme réelle." />
      <CardBody className="space-y-3">
        {cfg.media.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2 text-xs">
            <img src={m.url} alt="" className="size-10 rounded object-cover" />
            <span className="flex-1 truncate">{m.alt} · <span className="text-muted">{m.license}</span></span>
            <Button size="icon" variant="ghost" aria-label="Retirer" onClick={() => update((c) => { const id = c.media[i]!.id; c.media.splice(i, 1); if (c.hero.mediaId === id) c.hero.mediaId = null; c.sections.forEach((s) => { if (s.type === 'gallery') s.mediaIds = s.mediaIds.filter((x) => x !== id) }) })}><Trash2 /></Button>
          </div>
        ))}
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const url = String(fd.get('url'))
            if (!/^https:\/\//.test(url)) return toast.error('URL https:// requise')
            update((c) => { c.media.push({ id: `m${Date.now().toString(36)}`, url, alt: String(fd.get('alt')), license: String(fd.get('license')), source: String(fd.get('source') || '') || undefined }) })
            e.currentTarget.reset()
          }}
        >
          <Input name="url" placeholder="https://… (image)" required className="col-span-2" />
          <Input name="alt" placeholder="Description (alt)" required />
          <Input name="license" placeholder="Licence (ex. fournie par le client, CC BY)" required />
          <Input name="source" placeholder="Source / crédit" className="col-span-2" />
          <Button type="submit" size="sm" variant="outline" className="col-span-2"><Plus />Ajouter le média</Button>
        </form>
      </CardBody>
    </Card>
  )
}
