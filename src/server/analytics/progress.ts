import { cache } from 'react'
import { sql } from '../core/db'
import { getSettings } from '../core/settings'
import { aiAvailability } from '../ai/client'
import { billingSetup } from '../billing/stripe'
import type { WorkspaceProgress,Mission } from '@/lib/workspace-progress'
export const workspaceProgress=cache(async():Promise<WorkspaceProgress>=>{
 const [[counts],settings,ai,billing]=await Promise.all([
  sql()`select
   (select count(*)::int from businesses where merged_into is null) prospects,
   (select count(distinct business_id)::int from business_enrichments where field='website_text' or field='site_brief' and length(value->>'publicDetails')>10) briefs,
   (select count(distinct business_id)::int from generated_websites where status='READY' and deleted_at is null) sites,
   (select count(distinct business_id)::int from proposals) proposals,
   (select count(*)::int from website_orders where status='PAID' and not livemode) test_sales,
   (select count(*)::int from website_orders where status='PAID' and livemode) sales,
   (select count(*)::int from website_hosting h join website_orders o on o.id=h.order_id where o.livemode and o.status='PAID' and h.deploy_status='READY' and h.subscription_status='active') online`,
  getSettings(),aiAvailability(),billingSetup(),
 ])
 const definitions=[
  {code:'first_prospect',title:'Votre première entreprise',description:'Trouvez ou importez une entreprise réelle.',xp:20,current:Number(counts!.prospects),target:1,href:'/search',main:true},
  {code:'ai_connected',title:'Un moteur pour créer',description:'Connectez votre IA de création.',xp:40,current:ai.available?1:0,target:1,href:'/settings?tab=ai',main:true},
  {code:'first_site',title:'Votre première création',description:'Terminez un site prêt à présenter.',xp:80,current:Number(counts!.sites),target:1,href:'/generator',main:true},
  {code:'first_proposal',title:'Une proposition qui vous ressemble',description:'Préparez un email pour présenter une démo.',xp:60,current:Number(counts!.proposals),target:1,href:'/sites',main:true},
  {code:'production',title:'Prêt pour vos clients',description:'Validez les réglages puis passez en production.',xp:80,current:settings.launch.mode==='live'&&billing.ready?1:0,target:1,href:'/settings?tab=general#launch-mode',main:true},
  {code:'first_sale',title:'Votre première vente réelle',description:'Un paiement réel confirmé par Stripe.',xp:150,current:Number(counts!.sales),target:1,href:'/sales',main:true},
  {code:'first_online',title:'Du projet au site en ligne',description:'Publiez un site client avec son abonnement actif.',xp:200,current:Number(counts!.online),target:1,href:'/sales',main:true},
  {code:'rich_brief',title:'Le sens du détail',description:'Ajoutez un brief public validé ou récupérez le texte officiel d’une entreprise.',xp:30,current:Number(counts!.briefs),target:1,href:'/prospects',main:false},
  {code:'three_sites',title:'Un atelier qui prend forme',description:'Trois entreprises différentes avec leur démo prête. Régénérer la même ne compte pas deux fois.',xp:80,current:Number(counts!.sites),target:3,href:'/generator',main:false},
  {code:'test_purchase',title:'Un essai de bout en bout',description:'Validez une commande Stripe test avant vos premières ventes réelles.',xp:50,current:Number(counts!.test_sales),target:1,href:'/sites',main:false},
 ]
 const earnedNow=definitions.filter(mission=>mission.current>=mission.target).map(mission=>({code:mission.code,xp:mission.xp}))
 if(earnedNow.length)await sql()`insert into workspace_achievements(code,xp) select code,xp from jsonb_to_recordset(${sql().json(earnedNow)}) as x(code text,xp integer) on conflict(code) do nothing`
 const earned=await sql()< {code:string;xp:number}[]>`select code,xp from workspace_achievements`
 const codes=new Set(earned.map(row=>row.code)),xp=earned.reduce((total,row)=>total+row.xp,0)
 const levels=[{xp:0,name:'Découverte'},{xp:80,name:'Création'},{xp:200,name:'Atelier'},{xp:400,name:'Studio'},{xp:700,name:'Maîtrise'}]
 const index=levels.findLastIndex(level=>xp>=level.xp)
 const missions:Mission[]=definitions.map(mission=>({...mission,current:Math.min(mission.current,mission.target),done:codes.has(mission.code)}))
 return {epoch:settings.workspaceEpoch,xp,level:index+1,levelName:levels[index]!.name,levelStart:levels[index]!.xp,nextXp:levels[index+1]?.xp??null,missions}
})
