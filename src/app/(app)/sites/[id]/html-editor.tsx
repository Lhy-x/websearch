'use client'
import { Camera, Download, ExternalLink, Eye, EyeOff, Monitor, RotateCcw, Save, Smartphone, Wand2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, Notice, Textarea } from '@/components/ui/primitives'
import { useJobRunner } from '@/components/use-job'
import type { HtmlSite } from '@/lib/site/bespoke-schema'
import { api, fmtDate } from '@/lib/utils'

interface Props {
  site: { id: string; business_id: string; business_name: string; preview_enabled: boolean; preview_expires_at: string | null; generator: string | null; model: string | null; previewUrl: string }
  initial: { version: number; config: HtmlSite }
  versions: { version: number; created_by: string; note: string | null; created_at: string }[]
  shots: { kind: string; path: string; version: number }[]
}

const SUGGESTIONS = ['Rends le site plus chaleureux et plus lumineux', 'Mets davantage en avant le bouton d’appel sur mobile', 'Change la palette pour des tons bleu nuit et laiton', 'Typographie plus éditoriale, titres plus grands', 'Simplifie : moins de sections, plus d’air']

export function HtmlEditor({ site, initial, versions, shots }: Props) {
  const router = useRouter()
  const runJob = useJobRunner()
  const [cfg, setCfg] = useState<HtmlSite>(initial.config)
  const [base, setBase] = useState(initial.version)
  const [code, setCode] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [html, setHtml] = useState('')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [instruction, setInstruction] = useState('')
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCfg(initial.config)
    setBase(initial.version)
    setDirty(false)
  }, [initial.version, initial.config])
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const res = await fetch('/api/sites/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) })
      if (res.ok) setHtml(await res.text())
    }, 400)
  }, [cfg])

  const post = (json: Record<string, unknown>) => api<{ jobId?: string; version?: number }>(`/api/sites/${site.id}`, { method: 'POST', json })
  const save = async () => {
    setSaving(true)
    try {
      const r = await api<{ version: number }>(`/api/sites/${site.id}`, { method: 'PUT', json: { config: cfg, baseVersion: base, note: 'Modification manuelle du code' } })
      setBase(r.version)
      setDirty(false)
      toast.success(`Version ${r.version} enregistrée (code re-sanitisé)`)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const report = cfg.report
  const plan = cfg.designPlan

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted"><Link href="/sites" className="hover:text-fg">Sites générés</Link> / <Link href={`/prospects/${site.business_id}`} className="hover:text-fg">{site.business_name}</Link></p>
          <h1 className="text-lg font-semibold">Site sur mesure — v{base} <Badge tone="primary">IA</Badge>{dirty ? <Badge tone="warning" className="ml-2">non enregistré</Badge> : null}</h1>
          <p className="text-xs text-muted">{site.generator}{site.model ? ` · ${site.model}` : ''}{site.preview_expires_at ? ` · démo jusqu’au ${fmtDate(site.preview_expires_at, false)}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href={site.previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />Démo publique</a></Button>
          <Button variant="outline" onClick={async () => { await post({ action: 'preview', enabled: !site.preview_enabled }); router.refresh() }}>{site.preview_enabled ? <><EyeOff />Désactiver la démo</> : <><Eye />Activer la démo</>}</Button>
          <Button variant="outline" onClick={async () => {
            const res = await fetch(`/api/sites/${site.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'export', includeMedia: true }) })
            if (!res.ok) return toast.error('Export impossible')
            const a = document.createElement('a')
            a.href = URL.createObjectURL(await res.blob())
            a.download = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'site.zip'
            a.click()
          }}><Download />Export ZIP</Button>
          {code ? <Button onClick={save} loading={saving} disabled={!dirty}><Save />Enregistrer le code</Button> : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Demander une modification" description="L’IA réécrit le site selon votre demande, puis la nouvelle version repasse les contrôles (faits, contacts, rendu mobile)." />
            <CardBody className="space-y-2">
              <Textarea rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex. : un hero plus affirmé avec le numéro de téléphone bien visible" aria-label="Modification demandée" />
              <div className="flex flex-wrap gap-1">{SUGGESTIONS.map((s) => <button key={s} onClick={() => setInstruction(s)} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted hover:text-fg">{s}</button>)}</div>
              <Button disabled={instruction.trim().length < 3 || dirty} onClick={() => runJob('Modification du site', () => post({ action: 'revise', instruction: instruction.trim() }))}><Wand2 />Appliquer avec l’IA</Button>
              {dirty ? <p className="text-xs text-warning">Enregistrez ou annulez vos modifications de code avant.</p> : null}
            </CardBody>
          </Card>

          {plan ? (
            <Card>
              <CardHeader title="Plan de design" />
              <CardBody className="space-y-2 text-xs">
                <p><strong>Concept :</strong> {plan.concept}</p>
                <div className="flex flex-wrap gap-1.5">{plan.palette.map((c) => <span key={c.hex + c.name} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5"><span className="size-3 rounded-sm border border-border" style={{ background: /^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : undefined }} />{c.name}</span>)}</div>
                <p><strong>Typographie :</strong> {plan.typography}</p>
                <p><strong>Mise en page :</strong> {plan.layout}</p>
                <p><strong>Signature :</strong> {plan.signature}</p>
                {plan.revisions ? <p className="text-muted"><strong>Révisions :</strong> {plan.revisions}</p> : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Contrôle qualité" description={report ? `${report.passes} passe(s) de correction automatique` : 'Version modifiée à la main'} />
            <CardBody className="space-y-1.5 text-xs">
              {report?.issues.length ? report.issues.map((i, k) => <p key={k} className="flex gap-2"><Badge tone={i.severity === 'critical' ? 'danger' : i.severity === 'major' ? 'warning' : 'neutral'}>{i.severity}</Badge>{i.message}</p>) : <p className="text-success">Aucun problème détecté (faits, contacts, rendu mobile et ordinateur).</p>}
              {report?.removed.length ? <Notice tone="info" title="Éléments retirés par la sécurité">{report.removed.slice(0, 12).join(', ')}{report.removed.length > 12 ? '…' : ''}</Notice> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Code HTML" actions={<Button size="sm" variant="ghost" onClick={() => setCode((c) => !c)}>{code ? 'Masquer' : 'Modifier le code'}</Button>} />
            {code ? (
              <CardBody>
                <Textarea rows={18} className="font-mono text-[11px]" value={cfg.html} spellCheck={false} onChange={(e) => { setCfg({ ...cfg, html: e.target.value, report: null }); setDirty(true) }} aria-label="Code HTML" />
                <p className="mt-1 text-[11px] text-muted">Le code est re-sanitisé à l’enregistrement (pas de JavaScript, pas de formulaire, pas d’image externe non autorisée).</p>
                {dirty ? <Button size="sm" variant="ghost" onClick={() => { setCfg(initial.config); setDirty(false) }}>Annuler les modifications</Button> : null}
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Versions" />
            <ul className="divide-y divide-border text-xs">
              {versions.map((v) => (
                <li key={v.version} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0">v{v.version} · {v.created_by} · {fmtDate(v.created_at)}{v.note ? <span className="block truncate text-muted">{v.note}</span> : null}</span>
                  {v.version !== base ? <Button size="sm" variant="ghost" onClick={async () => { await post({ action: 'restore', version: v.version }); toast.success(`Version ${v.version} restaurée`); router.refresh() }}><RotateCcw />Restaurer</Button> : <Badge tone="primary">actuelle</Badge>}
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
            <div className="flex items-center gap-2 text-xs">
              {shots.slice(0, 2).map((s) => <a key={s.path} href={`/api/files/${s.path}`} target="_blank" className="text-primary">{s.kind.replace('screenshot_', 'capture ')} v{s.version}</a>)}
              <Button size="sm" variant="ghost" onClick={() => runJob('Captures', () => post({ action: 'capture' }))}><Camera />Recapturer</Button>
            </div>
          </div>
          <div className="grid place-items-center rounded-xl border border-border bg-panel-2 p-3">
            <iframe title="Aperçu du site" sandbox="" srcDoc={html} className="rounded-lg border border-border bg-white" style={{ width: device === 'mobile' ? 390 : '100%', height: '78vh' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
