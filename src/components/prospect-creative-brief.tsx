'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/utils'
import { Button } from './ui/button'
import { Card,CardBody,CardHeader,Field,Textarea } from './ui/primitives'
export function ProspectCreativeBrief({id,initial}:{id:string;initial:{publicDetails?:string;artDirection?:string}}){
  const [details,setDetails]=useState(initial.publicDetails??''),[direction,setDirection]=useState(initial.artDirection??''),[busy,setBusy]=useState(false)
  return <Card><CardHeader title="Ce qui rend cette entreprise unique" description="Facultatif : complétez les informations déjà connues pour créer un site encore plus personnalisé. Les notes CRM privées ne sont jamais reprises dans ce brief."/><CardBody><form className="space-y-4" onSubmit={async event=>{event.preventDefault();setBusy(true);try{await api(`/api/prospects/${id}`,{method:'POST',json:{action:'site_brief',publicDetails:details,artDirection:direction}});toast.success('Brief de création enregistré')}catch(error){toast.error((error as Error).message)}finally{setBusy(false)}}}><Field label="Informations publiques validées" hint="Prestations réelles, spécialités, histoire vérifiée, produits, vocabulaire de l’entreprise. Ajoutez uniquement ce qui peut être publié."><Textarea rows={5} maxLength={8000} value={details} onChange={event=>setDetails(event.target.value)}/></Field><Field label="Direction artistique propre à ce prospect" hint="Ambiance, références, couleurs à privilégier ou à éviter. L’IA choisit sa composition sur mesure."><Textarea rows={3} maxLength={3000} value={direction} onChange={event=>setDirection(event.target.value)}/></Field><Button loading={busy} type="submit">Enregistrer le brief</Button></form></CardBody></Card>
}
