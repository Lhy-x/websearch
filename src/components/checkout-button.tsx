'use client'

import { useState } from 'react'
import { ArrowRight,CreditCard } from 'lucide-react'
import { Button } from './ui/button'
import { Notice } from './ui/primitives'
import { api } from '@/lib/utils'

export function CheckoutButton({token}:{token:string}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function pay(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('')
    try {
      const {url}=await api<{url:string}>(`/buy/${token}/checkout`,{method:'POST',headers:{accept:'application/json'}})
      const target=new URL(url)
      if(target.protocol!=='https:'||!(target.hostname==='stripe.com'||target.hostname.endsWith('.stripe.com')))throw new Error('Le lien de paiement est indisponible. Réessayez.')
      window.location.assign(target.href)
    } catch(error) {setError((error as Error).message);setBusy(false)}
  }
  return <form method="post" action={`/buy/${token}/checkout`} onSubmit={pay} className="space-y-4">
    {error?<div role="alert"><Notice title="Le paiement n’a pas pu être ouvert" tone="warning">{error}</Notice></div>:null}
    <Button type="submit" size="lg" className="w-full" loading={busy}><CreditCard/>{error?'Réessayer le paiement':'Payer avec Stripe'}<ArrowRight/></Button>
  </form>
}
