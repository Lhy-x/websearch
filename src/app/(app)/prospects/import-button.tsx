'use client'
import { Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Notice, Select } from '@/components/ui/primitives'
import { api } from '@/lib/utils'

interface Preview { key: string; filename: string; columns: string[]; fields: string[]; mapping: Record<string, string>; sample: Record<string, string>[]; total: number; valid: number; errors: { line: number; errors: string[] }[]; errorCount: number }

const LABELS: Record<string, string> = { name: 'Nom *', sector: 'Secteur', address: 'Adresse', postcode: 'Code postal', city: 'Ville', country: 'Pays', lat: 'Latitude', lon: 'Longitude', phone: 'Téléphone', email: 'Email', website: 'Site web', siret: 'SIRET', naf: 'Code NAF', external_id: 'Identifiant', tags: 'Tags' }

export function ImportButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [country, setCountry] = useState('FR')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const analyse = async (f: File, m?: Record<string, string>) => {
    const fd = new FormData()
    fd.set('file', f)
    fd.set('country', country)
    if (m) fd.set('mapping', JSON.stringify(m))
    setBusy(true)
    try {
      const p = await api<Preview>('/api/import/preview', { method: 'POST', body: fd })
      setPreview(p)
      setMapping(p.mapping)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Upload />Importer</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Importer des prospects" description="CSV, JSON ou XLSX (10 Mo max). Les lignes invalides sont listées et ignorées." wide>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <input type="file" accept=".csv,.json,.xlsx,.txt" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setPreview(null); if (f) void analyse(f) }} className="text-xs" />
            <Field label="Pays par défaut"><Select value={country} onChange={(e) => setCountry(e.target.value)} className="w-32"><option value="FR">France</option><option value="BE">Belgique</option><option value="CH">Suisse</option></Select></Field>
          </div>
          {preview ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {preview.fields.map((f) => (
                  <Field key={f} label={LABELS[f] ?? f}>
                    <Select value={mapping[f] ?? ''} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value) n[f] = e.target.value; else delete n[f]; return n })}>
                      <option value="">— ignorer —</option>
                      {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </Field>
                ))}
              </div>
              <Button size="sm" variant="outline" loading={busy} onClick={() => file && analyse(file, mapping)}>Revalider avec ce mapping</Button>
              <Notice tone={preview.errorCount ? 'warning' : 'success'} title={`${preview.valid} ligne(s) valide(s) sur ${preview.total}`}>
                {preview.errorCount ? (
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">{preview.errors.map((e) => <li key={e.line}>Ligne {e.line} : {e.errors.join(', ')}</li>)}</ul>
                ) : 'Aucune erreur détectée.'}
              </Notice>
              <div className="flex justify-end">
                <Button
                  disabled={!preview.valid || !mapping.name}
                  loading={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await api('/api/import/commit', { method: 'POST', json: { key: preview.key, filename: preview.filename, mapping, country } })
                      toast.success('Import lancé — suivi dans Automatisations')
                      setOpen(false)
                      router.refresh()
                    } catch (e) {
                      toast.error((e as Error).message)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Importer {preview.valid} ligne(s)
                </Button>
              </div>
            </>
          ) : busy ? <p className="text-xs text-muted">Analyse…</p> : null}
        </div>
      </Dialog>
    </>
  )
}
