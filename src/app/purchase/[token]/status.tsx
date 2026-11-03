'use client'
import {useRouter} from 'next/navigation'
import {useEffect} from 'react'
export function PaymentRefresh({invoice=false}:{invoice?:boolean}){const router=useRouter();useEffect(()=>{let n=0;const t=setInterval(()=>{router.refresh();if(++n>=60)clearInterval(t)},3000);return()=>clearInterval(t)},[router]);return <p className="mt-5 text-sm text-muted">{invoice?'La facture est en cours de préparation. Cette page se met à jour automatiquement.':'La confirmation Stripe est en cours de réception. Cette page se met à jour automatiquement. Si cela dure, conservez ce lien et contactez le vendeur.'}</p>}
