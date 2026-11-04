'use client'
import {BillingSettings} from '@/components/billing-settings'
import dynamic from 'next/dynamic'
import {DataResetPanel} from '@/components/data-reset-panel'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, CreditCard, Mail, Settings2, Sparkles, XCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, Field, Input, Notice, Select, Table, Td, Textarea, Th } from '@/components/ui/primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SECTORS } from '@/lib/sectors'
import { STYLES } from '@/lib/site/schema'
import { api, fmtDate } from '@/lib/utils'
import type { Settings } from '@/server/core/settings'

const ConnectionsSettings=dynamic(()=>import('@/components/connections-settings').then(module=>module.ConnectionsSettings),{loading:()=> <p role="status" className="p-6 text-sm text-muted">Chargement des connexions…</p>})

type Secrets = Record<string, 'env' | 'db' | 'missing'>
interface Infra {
  postgres: { ok: boolean; version?: string; size?: string; error?: string }
  queue: string
  workers: { id: string; online: boolean; lastSeen: string }[]
  storage: { root: string; usedBytes: number; disk: { freeBytes: number; totalBytes: number } | null }
  backup: { file: string; size: number; at: string } | null
  connectors: { id: string; label: string; configured: boolean; enabled: boolean; message: string }[]
  ai: { available: boolean; provider: string; reason?: string }
  email: { provider: string; inbound: { imap: boolean; webhook: boolean } }
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} Mo`

export function SettingsClient({ settings, secrets, infra, offers, strategies, suppression, initialTab='general' }: { initialTab?:string; settings: Settings; secrets: Secrets; infra: Infra; offers: { id: string; name: string; kind: string; description: string; price_cents: number | null; active: boolean }[]; strategies: { id: string; name: string; instructions: string; tone: string; is_default: boolean }[]; suppression: { id: string; email: string | null; domain: string | null; reason: string; source: string | null; created_at: string }[] }) {
  const router = useRouter()
  const [s, setS] = useState<Settings>(settings)
  const [tab,setTab]=useState(initialTab)
  const [advanced,setAdvanced]=useState(!['general','ai','outreach','payment','connections'].includes(initialTab))
  const [busy, setBusy] = useState(false)
  const patch = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => setS((x) => ({ ...x, [k]: { ...(x[k] as object), ...v } }))
  const save = async () => {
    setBusy(true)
    try {
      await api('/api/settings', { method: 'PUT', json: s })
      toast.success('Paramètres enregistrés')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const post = async (json: Record<string, unknown>, ok?: string) => {
    try {
      const r = await api<Record<string, unknown>>('/api/settings', { method: 'POST', json })
      if (ok) toast.success(ok)
      router.refresh()
      return r
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const SaveBar = () => <div className="flex justify-end"><Button onClick={save} loading={busy}>Enregistrer</Button></div>

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="flex-wrap">
        {[['general','L’essentiel'],['ai','Mon IA'],['outreach','Mes emails'],['payment','Paiement'],['connections','Clés & connexions'],...(advanced?[['search','Recherche'],['sites','Sites'],['scoring','Scoring'],['automation','Automatisations'],['offers','Offres & prompts'],['suppression','Opposition'],['infra','Infrastructure']]:[])].map(([k,l])=><TabsTrigger key={k} value={k!}>{l}</TabsTrigger>)}
        <button className="px-3 py-2 text-xs text-muted" onClick={()=>{if(advanced&&!['general','ai','outreach','payment','connections'].includes(tab))setTab('general');setAdvanced(!advanced)}}>Options avancées {advanced?'−':'+'}</button>
      </TabsList>

      <TabsContent value="general"><div className="settings-intro"><div><p className="eyebrow mb-3">À VOTRE IMAGE</p><h2>Trois réglages pour bien démarrer.</h2><p>Connectez votre IA, préparez votre signature et ajoutez le paiement quand vous souhaitez vendre. Vous pourrez revenir sur chaque choix.</p></div><span className="settings-icon"><Settings2 size={25}/></span></div><div className="grid gap-5 md:grid-cols-3">{[{value:'ai',title:'1. Mon intelligence artificielle',status:infra.ai.available?'Connectée':'À connecter',description:'Votre moteur de création pour des sites sur mesure.',icon:Sparkles},{value:'outreach',title:'2. Ma signature email',status:s.outreach.senderEmail||'À personnaliser',description:'Votre nom et vos coordonnées dans chaque proposition.',icon:Mail},{value:'payment',title:'3. Mon paiement Stripe',status:s.commerce.enabled?'Configuration à vérifier':'À configurer quand vous êtes prêt',description:'Un prix unique, le paiement et une facture pour le client.',icon:CreditCard}].map(item=><Card key={item.value}><CardBody><span className="mb-5 inline-flex rounded-2xl bg-primary/8 p-3 text-primary"><item.icon size={21}/></span><h3 className="text-sm font-semibold tracking-tight">{item.title}</h3><p className="mt-3 text-xs leading-7 text-muted">{item.description}</p><p className="my-5 truncate text-xs font-medium text-primary">{item.status}</p><Button variant="outline" onClick={()=>setTab(item.value)}>Configurer<ArrowRight/></Button></CardBody></Card>)}</div></TabsContent>
      <TabsContent value="payment"><BillingSettings onSaved={data=>{patch('commerce',data.commerce);patch('sites',{previewBaseUrl:data.base})}}/></TabsContent>
      <TabsContent value="ai" className="space-y-4">
        <Card><CardBody className="grid gap-4 md:grid-cols-3">
          <Field label="Fournisseur" hint="Abonnement = vos crédits Claude Pro/Max ou ChatGPT, via le CLI officiel connecté sur la machine du worker. Aucune clé API."><Select value={s.ai.provider} onChange={(e) => patch('ai', { provider: e.target.value as Settings['ai']['provider'] })}>
            <option value="none">Aucun</option>
            <optgroup label="Abonnement (sans clé API)"><option value="claude-code">Claude — abonnement Pro/Max (CLI claude)</option><option value="codex">ChatGPT — abonnement (CLI codex)</option></optgroup>
            <optgroup label="Clé API (facturation à l’usage)"><option value="anthropic">Anthropic API</option><option value="openai">OpenAI API</option><option value="openrouter">OpenRouter</option></optgroup>
          </Select></Field>
          <Field label="Mode de coût" hint="LOW_COST : aucun appel IA pour les sites et emails. BALANCED : modèle fort pour la génération, économique pour la classification. HIGH_QUALITY : modèle fort partout."><Select value={s.ai.costMode} onChange={(e) => patch('ai', { costMode: e.target.value as Settings['ai']['costMode'] })}><option value="LOW_COST">Économique — génération IA désactivée</option><option value="BALANCED">Équilibré — recommandé</option><option value="HIGH_QUALITY">Qualité maximale</option></Select></Field>
          {s.ai.provider === 'claude-code' || s.ai.provider === 'codex' ? (
            <Field label="Appels IA max / jour (abonnement)" hint="Protège les limites de votre abonnement. Un site sur mesure = 1 à 3 appels."><Input type="number" min={1} max={2000} value={s.ai.subscriptionDailyCalls} onChange={(e) => patch('ai', { subscriptionDailyCalls: Number(e.target.value) })} /></Field>
          ) : (
            <Field label="Budget IA journalier ($)" hint="Les appels sont refusés au-delà (vérification avant chaque appel)."><Input type="number" min={0} step={0.5} value={s.ai.dailyBudgetUsd} onChange={(e) => patch('ai', { dailyBudgetUsd: Number(e.target.value) })} /></Field>
          )}
          <details className="ui-details md:col-span-3"><summary>Modèles et réglages avancés</summary><div className="grid gap-4 md:grid-cols-3">
          <Field label="Modèle économique" hint={{ anthropic: 'Défaut : claude-haiku-5-5', 'claude-code': 'Défaut : haiku (alias du CLI)', codex: 'Vide = modèle par défaut de Codex' }[s.ai.provider as string] ?? 'Requis pour OpenAI / OpenRouter'}><Input value={s.ai.cheapModel} onChange={(e) => patch('ai', { cheapModel: e.target.value })} placeholder={{ anthropic: 'claude-haiku-5-5', 'claude-code': 'haiku' }[s.ai.provider as string] ?? ''} /></Field>
          <Field label="Modèle performant (sites sur mesure)" hint={{ anthropic: 'Défaut : claude-opus-5-5', 'claude-code': 'Défaut : opus (le meilleur modèle de votre forfait)', codex: 'Vide = modèle par défaut de Codex' }[s.ai.provider as string] ?? 'Requis pour OpenAI / OpenRouter'}><Input value={s.ai.strongModel} onChange={(e) => patch('ai', { strongModel: e.target.value })} placeholder={{ anthropic: 'claude-opus-5-5', 'claude-code': 'opus' }[s.ai.provider as string] ?? ''} /></Field>
          <Field label="Température" hint="OpenAI / OpenRouter uniquement (non utilisée par l’API Anthropic récente)"><Input type="number" min={0} max={1.5} step={0.1} value={s.ai.temperature} onChange={(e) => patch('ai', { temperature: Number(e.target.value) })} /></Field>
          </div></details>
          <Field label="Consignes personnalisées pour la génération de sites" className="md:col-span-3"><Textarea rows={3} maxLength={4000} value={s.ai.customSiteInstructions} onChange={(e) => patch('ai', { customSiteInstructions: e.target.value })} /></Field>
        </CardBody></Card>
        <Notice tone={infra.ai.available ? 'success' : 'warning'} title={infra.ai.available ? `IA opérationnelle (${infra.ai.provider})` : 'IA non configurée'}>{infra.ai.available ? (s.ai.provider === 'claude-code' || s.ai.provider === 'codex' ? 'Connecté via votre abonnement. Le plafond d’appels journalier s’applique.' : 'La clé est présente. Le budget journalier s’applique.') : infra.ai.reason}</Notice>
        <SaveBar />
        <AiConnection onCheck={() => post({ action: 'ai_status' })} onTest={() => post({ action: 'ai_test' })} />
      </TabsContent>

      <TabsContent value="search" className="space-y-4">
        <Card><CardBody className="grid gap-4 md:grid-cols-3">
          <Field label="Pays par défaut"><Select value={s.search.defaultCountry} onChange={(e) => patch('search', { defaultCountry: e.target.value as 'FR' })}><option value="FR">France</option><option value="BE">Belgique</option><option value="CH">Suisse</option></Select></Field>
          <Field label="Rayon par défaut (km)"><Input type="number" min={1} max={100} value={s.search.defaultRadiusKm} onChange={(e) => patch('search', { defaultRadiusKm: Number(e.target.value) })} /></Field>
          <Field label="Résultats max par recherche"><Input type="number" min={10} max={5000} value={s.search.maxResults} onChange={(e) => patch('search', { maxResults: Number(e.target.value) })} /></Field>
          <Field group label="Sources activées par défaut" className="md:col-span-3">
            <div className="flex flex-wrap gap-4">
              {infra.connectors.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.search.sources[c.id as keyof Settings['search']['sources']] ?? false} onChange={(e) => patch('search', { sources: { ...s.search.sources, [c.id]: e.target.checked } })} />{c.label}{!c.configured ? <Badge tone="warning">Non configuré</Badge> : null}</label>
              ))}
            </div>
          </Field>
          <Field group label="Secteurs ciblés (pertinence maximale dans le score)" className="md:col-span-3">
            <div className="flex flex-wrap gap-2">
              {SECTORS.map((x) => <label key={x.id} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={s.targetSectors.includes(x.id)} onChange={(e) => setS((v) => ({ ...v, targetSectors: e.target.checked ? [...v.targetSectors, x.id] : v.targetSectors.filter((t) => t !== x.id) }))} />{x.label}</label>)}
            </div>
          </Field>
        </CardBody></Card>
        <SaveBar />
      </TabsContent>

      <TabsContent value="outreach" className="space-y-4">
        <Card><CardBody className="grid gap-4 md:grid-cols-3">
          <Field label="Nom expéditeur"><Input value={s.outreach.senderName} onChange={(e) => patch('outreach', { senderName: e.target.value })} /></Field>
          <Field label="Email expéditeur"><Input type="email" value={s.outreach.senderEmail} onChange={(e) => patch('outreach', { senderEmail: e.target.value })} /></Field>
          <Field label="Répondre à"><Input type="email" value={s.outreach.replyTo} onChange={(e) => patch('outreach', { replyTo: e.target.value })} /></Field>
          <Field label="Signature" className="md:col-span-3"><Textarea rows={3} value={s.outreach.signature} onChange={(e) => patch('outreach', { signature: e.target.value })} /></Field>
          <Field label="Mention légale (raison sociale, SIRET)" hint="Ajoutée en pied de chaque email"><Input value={s.outreach.companyLegalLine} onChange={(e) => patch('outreach', { companyLegalLine: e.target.value })} /></Field>
          <Field label="Adresse postale"><Input value={s.outreach.physicalAddress} onChange={(e) => patch('outreach', { physicalAddress: e.target.value })} /></Field>
          <details className="ui-details md:col-span-3"><summary>Options des campagnes automatiques</summary><div className="grid gap-4 md:grid-cols-2"><Field label="Plafond quotidien par défaut"><Input type="number" min={1} max={2000} value={s.outreach.defaultDailyLimit} onChange={(e) => patch('outreach', { defaultDailyLimit: Number(e.target.value) })} /></Field>
          <Field label="Relances par défaut (jours après l’envoi initial)"><Input value={s.outreach.followupDelaysDays.join(', ')} onChange={(e) => patch('outreach', { followupDelaysDays: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => n > 0) })} /></Field></div></details>
        </CardBody></Card>
        <SaveBar />
        <details className="ui-details"><summary>Tester les envois et vérifier le domaine</summary><div className="space-y-5"><TestEmail onSend={(j) => post({ action: 'test_email', ...j })} />
        <DnsCheck onCheck={(d) => post({ action: 'dns_check', domain: d })} defaultDomain={s.outreach.senderEmail.split('@')[1] ?? ''} /></div></details>
      </TabsContent>

      <TabsContent value="sites" className="space-y-4">
        <Card><CardBody className="grid gap-4 md:grid-cols-3">
          <Field label="Style par défaut"><Select value={s.sites.defaultStyle} onChange={(e) => patch('sites', { defaultStyle: e.target.value as Settings['sites']['defaultStyle'] })}>{STYLES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Langue"><Select value={s.sites.language} onChange={(e) => patch('sites', { language: e.target.value as 'fr' })}><option value="fr">Français</option><option value="en">English</option><option value="de">Deutsch</option><option value="nl">Nederlands</option></Select></Field>
          <Notice tone="info" title="Atelier sur mesure">Le bouton de création conçoit une page unique à partir du skill Premium 3D Glass, avec votre fournisseur IA. Aucun template n’est sélectionné et aucun repli automatique n’est appliqué.</Notice>
          <Field label="Passes de correction automatique" hint="Après génération : contrôle des faits + rendu mesuré, puis correction par l’IA (0 à 3)."><Input type="number" min={0} max={3} value={s.sites.qualityPasses} onChange={(e) => patch('sites', { qualityPasses: Number(e.target.value) })} /></Field>
          <Field label="Critique visuelle" hint="L’IA regarde les captures réelles (mobile + ordinateur) de son site et l’affine. +1 appel, meilleur résultat."><Select value={s.sites.visualReview ? 'on' : 'off'} onChange={(e) => patch('sites', { visualReview: e.target.value === 'on' })}><option value="on">Activée (recommandé)</option><option value="off">Désactivée</option></Select></Field>
          <Field label="Durée de conservation des démos (jours)"><Input type="number" min={1} max={365} value={s.sites.previewTtlDays} onChange={(e) => patch('sites', { previewTtlDays: Number(e.target.value) })} /></Field>
          <Field label="Domaine de démonstration" hint="URL publique servant /preview (sinon APP_BASE_URL)" className="md:col-span-3"><Input value={s.sites.previewBaseUrl} onChange={(e) => patch('sites', { previewBaseUrl: e.target.value })} placeholder="https://demo.mon-domaine.fr" /></Field>
          <Field label="Mention de démonstration (pied de page des sites)" className="md:col-span-3"><Textarea rows={2} maxLength={300} value={s.sites.demoDisclaimer} onChange={(e) => patch('sites', { demoDisclaimer: e.target.value })} /></Field>
        </CardBody></Card>
        <SaveBar />
      </TabsContent>

      <TabsContent value="scoring" className="space-y-4">
        <Card><CardHeader title="Pondérations" description="Points attribués par critère ; le score final est normalisé sur 100. Recalculez les scores après modification (Qualification)." />
          <CardBody className="grid gap-4 md:grid-cols-4">
            {(Object.keys(s.scoring) as (keyof Settings['scoring'])[]).map((k) => (
              <Field key={k} label={{ noWebsiteConfirmed: 'Absence de site confirmée', noWebsiteKnown: 'Aucun site connu', websiteBroken: 'Site inaccessible', websiteLowQuality: 'Site de faible qualité', websiteOutdated: 'Site obsolète', sectorRelevance: 'Pertinence du secteur', emailAvailable: 'Email disponible', phoneAvailable: 'Téléphone disponible', dataQuality: 'Qualité des données', operatingOpen: 'Établissement ouvert', interactionPenaltyContacted: 'Pénalité déjà contacté', explicitNeed: 'Besoin explicite (tag)' }[k]}>
                <Input type="number" min={0} max={100} value={s.scoring[k]} onChange={(e) => patch('scoring', { [k]: Number(e.target.value) } as Partial<Settings['scoring']>)} />
              </Field>
            ))}
          </CardBody></Card>
        <SaveBar />
      </TabsContent>

      <TabsContent value="automation" className="space-y-4">
        <Card><CardBody className="grid gap-4 md:grid-cols-4">
          <Field label="Tâches simultanées max (par worker)"><Input type="number" min={1} max={16} value={s.automation.maxConcurrentJobs} onChange={(e) => patch('automation', { maxConcurrentJobs: Number(e.target.value) })} /></Field>
          <Field label="Tentatives max"><Input type="number" min={0} max={10} value={s.automation.maxRetries} onChange={(e) => patch('automation', { maxRetries: Number(e.target.value) })} /></Field>
          <Field label="Taille des lots d’enrichissement"><Input type="number" min={1} max={500} value={s.automation.enrichBatchSize} onChange={(e) => patch('automation', { enrichBatchSize: Number(e.target.value) })} /></Field>
          <Field label="Coût IA max / jour ($)" hint="Identique au budget de l’onglet IA"><Input type="number" value={s.ai.dailyBudgetUsd} onChange={(e) => patch('ai', { dailyBudgetUsd: Number(e.target.value) })} /></Field>
        </CardBody></Card>
        <SaveBar />
      </TabsContent>

      <TabsContent value="offers" className="space-y-4">
        <Card><CardHeader title="Offres commerciales" description="Utilisées dans les propositions et les campagnes" />
          <CardBody className="space-y-3">
            {[...offers, null].map((o, i) => (
              <form key={o?.id ?? `new-${i}`} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-6" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const price = String(fd.get('price') ?? ''); await post({ action: 'offer_save', id: o?.id, name: fd.get('name'), kind: fd.get('kind'), description: fd.get('description'), priceCents: price ? Math.round(Number(price.replace(',', '.')) * 100) : null, active: fd.get('active') === 'on' }, 'Offre enregistrée') }}>
                <Input name="name" defaultValue={o?.name} placeholder="Nouvelle offre" required className="md:col-span-2" />
                <Select name="kind" defaultValue={o?.kind ?? 'vitrine'}><option value="vitrine">Site vitrine</option><option value="refonte">Refonte</option><option value="maintenance">Site + maintenance</option><option value="seo_local">Site + SEO local</option><option value="booking">Site + rendez-vous</option><option value="custom">Autre</option></Select>
                <Input name="price" defaultValue={o?.price_cents != null ? String(o.price_cents / 100) : ''} placeholder="Prix € (optionnel)" />
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="active" defaultChecked={o?.active ?? true} />Active</label>
                <Button type="submit" size="sm" variant="outline">{o ? 'Enregistrer' : 'Ajouter'}</Button>
                <Textarea name="description" defaultValue={o?.description} rows={2} className="md:col-span-6" placeholder="Description factuelle de l’offre" />
              </form>
            ))}
          </CardBody></Card>
        <Card><CardHeader title="Stratégies de rédaction (éditeur de prompts)" description="Consignes injectées dans la rédaction IA des propositions" />
          <CardBody className="space-y-3">
            {[...strategies, null].map((st, i) => (
              <form key={st?.id ?? `new-${i}`} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); await post({ action: 'strategy_save', id: st?.id, name: fd.get('name'), instructions: fd.get('instructions'), tone: fd.get('tone'), isDefault: fd.get('isDefault') === 'on' }, 'Stratégie enregistrée') }}>
                <Input name="name" defaultValue={st?.name} placeholder="Nouvelle stratégie" required />
                <Input name="tone" defaultValue={st?.tone ?? 'professionnel'} placeholder="Ton" />
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="isDefault" defaultChecked={st?.is_default} />Par défaut</label>
                <div className="flex gap-1"><Button type="submit" size="sm" variant="outline">{st ? 'Enregistrer' : 'Ajouter'}</Button>{st ? <Button type="button" size="icon" variant="ghost" aria-label="Supprimer" onClick={() => confirm('Supprimer ?') && post({ action: 'strategy_delete', id: st.id })}><Trash2 /></Button> : null}</div>
                <Textarea name="instructions" defaultValue={st?.instructions} rows={3} required className="md:col-span-4" placeholder="Consignes de rédaction…" />
              </form>
            ))}
          </CardBody></Card>
      </TabsContent>

      <TabsContent value="suppression" className="space-y-4">
        <Card><CardHeader title="Liste de suppression globale" description="Désinscriptions, oppositions, rebonds et plaintes. Aucun email n’est envoyé à ces adresses ou domaines." />
          <CardBody>
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; await post({ action: 'suppress', value: new FormData(f).get('value') }, 'Ajouté à la liste'); f.reset() }}>
              <Input name="value" placeholder="email@exemple.fr ou domaine.fr" required /><Button type="submit">Ajouter</Button>
            </form>
          </CardBody>
          <Table><thead><tr><Th>Email / domaine</Th><Th>Motif</Th><Th>Source</Th><Th>Date</Th><Th /></tr></thead>
            <tbody>{suppression.map((x) => <tr key={x.id}><Td className="text-xs">{x.email ?? `@${x.domain}`}</Td><Td><Badge tone={x.reason === 'BOUNCE' ? 'warning' : 'danger'}>{x.reason}</Badge></Td><Td className="text-xs text-muted">{x.source}</Td><Td className="text-xs text-muted">{fmtDate(x.created_at)}</Td><Td className="text-right"><Button size="sm" variant="ghost" onClick={() => confirm('Retirer de la liste ? Ne le faites que si la personne a donné son accord.') && post({ action: 'unsuppress', id: x.id }, 'Retiré')}>Retirer</Button></Td></tr>)}</tbody>
          </Table>
        </Card>
      </TabsContent>

      <TabsContent value="connections"><ConnectionsSettings onSaved={data=>{patch('runtime',data.overrides);patch('automation',{maxConcurrentJobs:data.maxConcurrentJobs})}}/></TabsContent>

      <TabsContent value="infra">
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardHeader title="Services" /><CardBody className="space-y-2 text-sm">
            <Status ok={infra.postgres.ok} label={`PostgreSQL ${infra.postgres.version ?? ''} — ${infra.postgres.size ?? infra.postgres.error ?? ''}`} />
            <Status ok label={`File de tâches : ${infra.queue}`} />
            <Status ok={infra.workers.some((w) => w.online)} label={`Workers : ${infra.workers.filter((w) => w.online).length} actif(s) / ${infra.workers.length} connu(s)`} />
            <Status ok={infra.email.provider !== 'sandbox'} label={`Email sortant : ${infra.email.provider}${infra.email.provider === 'sandbox' ? ' (aucun envoi réel)' : ''}`} />
            <Status ok={infra.email.inbound.imap || infra.email.inbound.webhook} label={`Email entrant : ${[infra.email.inbound.imap ? 'IMAP' : null, infra.email.inbound.webhook ? 'webhook' : null].filter(Boolean).join(' + ') || 'non configuré'}`} />
            <Status ok={infra.ai.available} label={`IA : ${infra.ai.available ? infra.ai.provider : infra.ai.reason}`} />
          </CardBody></Card>
          <Card><CardHeader title="Stockage & sauvegardes" /><CardBody className="space-y-2 text-sm">
            <p>Répertoire : <span className="font-mono text-xs">{infra.storage.root}</span></p>
            <p>Utilisé : {mb(infra.storage.usedBytes)}{infra.storage.disk ? ` · libre : ${mb(infra.storage.disk.freeBytes)}` : ''}</p>
            <p>Dernière sauvegarde : {infra.backup ? `${infra.backup.file} (${mb(infra.backup.size)}) — ${fmtDate(infra.backup.at)}` : 'aucune'}</p>
          </CardBody></Card>
          <Card className="md:col-span-2"><CardHeader title="Connecteurs" /><CardBody className="space-y-2 text-sm">
            {infra.connectors.map((c) => <Status key={c.id} ok={c.configured && c.enabled} warn={c.configured && !c.enabled} label={`${c.label} — ${c.configured ? (c.enabled ? 'activé' : 'désactivé') : 'non configuré'} · ${c.message}`} />)}
          </CardBody></Card>
        </div>
        <DataResetPanel/>
      </TabsContent>
    </Tabs>
  )
}

function Status({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  return <p className="flex items-center gap-2">{ok ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <XCircle className={`size-4 shrink-0 ${warn ? 'text-muted' : 'text-warning'}`} />}{label}</p>
}

function TestEmail({ onSend }: { onSend: (j: Record<string, unknown>) => Promise<Record<string, unknown> | undefined> }) {
  const [res, setRes] = useState<Record<string, unknown> | null>(null)
  return (
    <Card><CardHeader title="Envoyer un email de test" description="Passe par le fournisseur configuré (sandbox = aucun envoi réel). Non comptabilisé dans les statistiques." />
      <CardBody>
        <form className="grid gap-2 md:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setRes((await onSend({ to: fd.get('to'), subject: fd.get('subject'), body: fd.get('body') })) ?? null) }}>
          <Input name="to" type="email" required placeholder="destinataire@exemple.fr" />
          <Input name="subject" required defaultValue="Test ProspectForge" />
          <Button type="submit">Envoyer le test</Button>
          <Textarea name="body" rows={2} required defaultValue="Ceci est un email de test." className="md:col-span-3" />
        </form>
        {res ? <pre className="mt-3 overflow-x-auto rounded-lg bg-panel-2 p-3 text-xs">{JSON.stringify(res, null, 2)}</pre> : null}
      </CardBody>
    </Card>
  )
}

function DnsCheck({ onCheck, defaultDomain }: { onCheck: (d: string) => Promise<Record<string, unknown> | undefined>; defaultDomain: string }) {
  const [res, setRes] = useState<Record<string, unknown> | null>(null)
  return (
    <Card><CardHeader title="Délivrabilité : SPF / DKIM / DMARC" />
      <CardBody>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setRes((await onCheck(String(new FormData(e.currentTarget).get('d')))) ?? null) }}>
          <Input name="d" defaultValue={defaultDomain} placeholder="mon-domaine.fr" required /><Button type="submit" variant="outline">Vérifier</Button>
        </form>
        {res ? <pre className="mt-3 overflow-x-auto rounded-lg bg-panel-2 p-3 text-xs">{JSON.stringify(res, null, 2)}</pre> : null}
      </CardBody>
    </Card>
  )
}

function AiConnection({ onCheck, onTest }: { onCheck: () => Promise<Record<string, unknown> | undefined>; onTest: () => Promise<Record<string, unknown> | undefined> }) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [test, setTest] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const st = (k: string) => status?.[k] as { installed: boolean; loggedIn: boolean | null; detail: string } | undefined
  return (
    <Card>
      <CardHeader title="Connexion par abonnement" description="Le worker appelle le CLI officiel connecté à votre compte. Installez-le et connectez-vous une fois sur la machine du worker (voir le tutoriel)." />
      <CardBody className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" loading={busy === 'c'} onClick={async () => { setBusy('c'); setStatus((await onCheck()) ?? null); setBusy(null) }}>Vérifier claude / codex</Button>
          <Button variant="outline" size="sm" loading={busy === 't'} onClick={async () => { setBusy('t'); setTest((await onTest()) ?? null); setBusy(null) }}>Tester un appel (fournisseur actuel)</Button>
        </div>
        {status ? (
          <div className="space-y-1">
            {(['claude', 'codex'] as const).map((k) => <Status key={k} ok={!!st(k)?.loggedIn} warn={st(k)?.installed === false} label={`${k === 'claude' ? 'Claude (Pro/Max)' : 'Codex (ChatGPT)'} — ${st(k)?.installed === false ? 'non installé' : st(k)?.detail}`} />)}
          </div>
        ) : null}
        {test ? <pre className="overflow-x-auto rounded-lg bg-panel-2 p-3 text-xs">{JSON.stringify(test, null, 2)}</pre> : null}
      </CardBody>
    </Card>
  )
}
