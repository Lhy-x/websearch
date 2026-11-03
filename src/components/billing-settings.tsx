'use client'
import {useEffect,useState} from 'react'
import {toast} from 'sonner'
import {Button} from './ui/button'
import {Card,CardBody,CardHeader,Field,Input,Notice} from './ui/primitives'
import {api} from '@/lib/utils'
import type {Settings} from '@/server/core/settings'
export function BillingSettings({onSaved}:{onSaved?:(data:{commerce:Settings['commerce'];base:string})=>void}) {
 const [data,setData]=useState<{ready:boolean;reason:string;live:boolean;base:string;keyConfigured:boolean;webhookConfigured:boolean;commerce:Settings['commerce']}|null>(null)
 const [taxRate,setTaxRate]=useState('');const [price,setPrice]=useState('');const [base,setBase]=useState('');const [enabled,setEnabled]=useState(false);const [key,setKey]=useState('');const [webhook,setWebhook]=useState('');const [busy,setBusy]=useState(false)
 async function load(){const r=await api<NonNullable<typeof data>>('/api/billing');setData(r);setTaxRate(r.commerce.taxRateId);setPrice(r.commerce.priceCents===null?'':String(r.commerce.priceCents/100));setBase(r.base);setEnabled(r.commerce.enabled);onSaved?.(r)}
 useEffect(()=>{load().catch(e=>toast.error(e.message))},[])
 if(!data)return <p className="p-5 text-sm text-muted">Chargement du paiement…</p>
 return <Card><CardHeader title="Paiement du site" description="Un seul prix pour tous vos sites. Stripe encaisse et génère la facture après paiement."/><CardBody className="space-y-5">
 <Notice tone={data.ready?'success':'warning'} title={data.ready?(data.live?'Clés réelles enregistrées':'Clés de test enregistrées'):data.reason}>{data.ready?'Le bouton de commande sera proposé sur les démonstrations actives.':'Renseignez ces informations une fois pour activer le bouton de paiement.'}</Notice>
 <Field label={`Prix unique (${data.commerce.currency.toUpperCase()})`} hint="Montant total demandé au client ; configurez votre identité de facturation et votre TVA dans Stripe."><Input type="number" min="0.50" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Votre prix"/></Field>
 <details><summary className="cursor-pointer text-xs text-muted">TVA, si applicable</summary><Field label="Identifiant du taux Stripe" hint="Créez le taux dans Stripe et collez son ID txr_… ; le prix saisi inclut ce taux. Laissez vide si aucun taux ne s’applique. Pas de calcul fiscal automatique par pays."><Input value={taxRate} onChange={e=>setTaxRate(e.target.value)} placeholder="txr_…"/></Field></details>
 <Field label="Adresse publique de vos démos" hint="HTTPS et accessible à vos clients pour les ventes réelles. localhost permet seulement les tests sur votre Mac."><Input type="url" value={base} onChange={e=>setBase(e.target.value)}/></Field>
 <Field label="Clé secrète Stripe" hint={data.keyConfigured?'Clé déjà enregistrée — laissez vide pour la conserver.':'Commencez avec une clé sk_test_… depuis votre compte Stripe.'}><Input type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder={data.keyConfigured?'Enregistrée':'sk_test_…'}/></Field>
 <Field label="Secret de signature du webhook" hint={data.webhookConfigured?'Secret déjà enregistré — laissez vide pour le conserver.':'Secret whsec_… fourni par Stripe pour cet endpoint.'}><Input type="password" autoComplete="new-password" value={webhook} onChange={e=>setWebhook(e.target.value)} placeholder={data.webhookConfigured?'Enregistré':'whsec_…'}/></Field>
 <p className="break-all rounded-xl bg-panel-2 p-3 text-xs">Webhook Stripe : {base.replace(/\/$/,'')}/api/webhooks/stripe<br/>Événements : checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, invoice.paid, invoice.finalized.</p>
 <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Proposer le paiement sur mes démos</label>
 <Button loading={busy} onClick={async()=>{setBusy(true);try{const cents=Math.round(Number(price.replace(',','.'))*100);if(!Number.isFinite(cents)||cents<50)throw new Error('Renseignez un prix supérieur ou égal à 0,50.');if(key){await api('/api/settings',{method:'POST',json:{action:'secret',key:'STRIPE_SECRET_KEY',value:key}});setKey('')}if(webhook){await api('/api/settings',{method:'POST',json:{action:'secret',key:'STRIPE_WEBHOOK_SECRET',value:webhook}});setWebhook('')}await api('/api/settings',{method:'PUT',json:{commerce:{enabled,priceCents:cents,taxRateId:taxRate.trim()},sites:{previewBaseUrl:base}}});await load();toast.success('Paiement enregistré')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}}>Enregistrer le paiement</Button>
 </CardBody></Card>
}
