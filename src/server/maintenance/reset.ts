import postgres from 'postgres'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import { mkdir,writeFile } from 'node:fs/promises'
import { env } from '../core/env'
import { storageRoot } from '../core/storage'
import { runBackup } from '../jobs/backup'
import { seedDefaults } from '../seed'
import { SECRET_KEYS } from '../core/settings'

// Explicit project ownership: no CASCADE and no tables belonging to another application.
export const PROJECT_TABLES=[
  'admin_settings','businesses','business_sources','business_contacts','business_enrichments','business_merges','website_audits','prospect_scores',
  'saved_searches','search_runs','geocode_cache','website_templates','generated_websites','website_versions','website_assets','sales_offers','prompt_strategies',
  'proposals','campaigns','campaign_sequences','campaign_prospects','outbound_messages','email_events','conversations','inbound_messages',
  'crm_opportunities','crm_tasks','crm_notes','automation_jobs','job_logs','automation_schedules','worker_heartbeats','suppression_list','api_usage',
  'audit_logs','preview_views','login_attempts','kv_store','website_orders','stripe_events',
] as const

export async function resetDatabase({confirm=false,log=console.log}:{confirm?:boolean;log?:(message:string)=>void}={}) {
  const db=postgres(env().DATABASE_URL,{max:1,onnotice:()=>{}})
  try {
    const [lock]=await db<{locked:boolean}[]>`select pg_try_advisory_lock(1672849301) locked`
    if(!lock?.locked)throw new Error('Une remise à zéro est déjà en cours.')
    const found=await db<{tablename:string}[]>`select tablename from pg_tables where schemaname='public'`
    const tables=PROJECT_TABLES.filter(name=>found.some(row=>row.tablename===name))
    if(!tables.includes('admin_settings')||!found.some(row=>row.tablename==='schema_migrations'))throw new Error('La base sélectionnée ne possède pas le schéma ProspectForge. Aucune suppression effectuée.')
    const counts:Record<string,number>={}
    for(const name of tables){const [row]=await db.unsafe<{n:number}[]>(`select count(*)::int n from public."${name}"`);counts[name]=row!.n}
    const url=new URL(env().DATABASE_URL)
    const target={host:url.hostname,database:decodeURIComponent(url.pathname.slice(1))}
    log(`Base ciblée : ${target.host} / ${target.database}`)
    log(`À effacer : ${counts.businesses??0} prospect(s), ${counts.generated_websites??0} démo(s), ${counts.website_orders??0} commande(s), ${counts.outbound_messages??0} email(s).`)
    if(!confirm)return {applied:false as const,target,counts}
    const e=env()
    if(!e.ADMIN_EMAIL||!e.ADMIN_PASSWORD_HASH||e.SESSION_SECRET.length<32||!e.APP_ENCRYPTION_KEY)throw new Error('L’accès administrateur doit être initialisé avant la remise à zéro. Aucune suppression effectuée.')
    const assertStopped=async()=>{
      const [other]=await db<{n:number}[]>`select count(*)::int n from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend'`
      if(other?.n)throw new Error('Arrêtez l’application et son moteur avec Ctrl+C dans LANCER-MAC.command, puis réessayez. Une autre connexion utilise encore cette base. Aucune suppression effectuée.')
    }
    await assertStopped()
    const directory=path.join(storageRoot(),'reset-backups')
    await mkdir(directory,{recursive:true,mode:0o700})
    const backup=await runBackup(e.DATABASE_URL,log,Infinity,{directory,record:false})
    const manifest=path.join(directory,backup.file.replace(/\.sql\.gz$/,'.json'))
    await writeFile(manifest,JSON.stringify({at:new Date().toISOString(),target,counts,backup:backup.file},null,2),{mode:0o600,flag:'wx'})
    await assertStopped()
    await db.begin(async tx=>{
      await tx`set local lock_timeout='5s'`
      await tx.unsafe(`truncate ${tables.map(name=>`public."${name}"`).join(',')} restart identity`)
      await tx`insert into admin_settings(id,data,secrets) values(1,${tx.json({workspaceEpoch:randomUUID(),runtime:{EMAIL_PROVIDER:'sandbox',IMAP_HOST:''}})},${tx.json(Object.fromEntries(SECRET_KEYS.map(key=>[key,''])))})`
      await seedDefaults(tx)
    })
    log('Base remise à zéro. Accès administrateur et fichier .env conservés. Références système réinstallées ; aucun prospect ni site de démonstration ajouté.')
    log('Envoi en simulation, réception désactivée et clés de service désactivées. Réactivez vos services dans Paramètres → Clés & connexions.')
    log(`Sauvegarde privée : ${path.join(directory,backup.file)}`)
    return {applied:true as const,target,counts,backup:{...backup,directory,manifest}}
  }finally{await db.end({timeout:5})}
}
