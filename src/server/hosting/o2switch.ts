import { Client } from 'basic-ftp'
import { Readable } from 'node:stream'
import path from 'node:path'
import { randomUUID,createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { resolve4,resolveTxt } from 'node:dns/promises'
import { connect } from 'node:tls'
import { sql } from '../core/db'
import { getSettings,getSecret,type Settings } from '../core/settings'
import { AppError } from '../core/errors'
import { assertSafeUrl,isPrivateIp } from '../core/safe-fetch'
import { buildSiteFiles } from '../sites/export'
import type { WebsiteVersionData } from '@/lib/site/bespoke-schema'

export type O2Config=Settings['hosting']
export function validateO2Config(config:O2Config) {
  if(!/^[a-z0-9.-]+\.o2switch\.(net|fr)$/i.test(config.host))throw new AppError('Renseignez le nom du serveur o2switch, par exemple serveur.o2switch.net, sans https ni port.',400)
  if(!/^[a-z][a-z0-9_]{0,31}$/i.test(config.username))throw new AppError('Renseignez l’identifiant principal cPanel / FTP o2switch.',400)
  if(!/^\/?[a-zA-Z0-9_/-]+$/.test(config.remoteBase)||config.remoteBase.includes('..')||config.remoteBase==='/'||!config.remoteBase.replaceAll('/',''))throw new AppError('Le dossier FTP doit être un chemin dédié de votre compte, par exemple /public_html.',400)
  if(isIP(config.serverIp)!==4||isPrivateIp(config.serverIp))throw new AppError('Renseignez l’adresse IPv4 publique partagée affichée dans cPanel.',400)
  try{const url=assertSafeUrl(config.publicBaseUrl);if(url.protocol!=='https:'||url.search||url.hash)throw new Error()}catch{throw new AppError('Renseignez l’adresse HTTPS publique qui correspond à ce dossier FTP.',400)}
}
async function credentials(){const [settings,password,token]=await Promise.all([getSettings(),getSecret('O2SWITCH_FTP_PASSWORD'),getSecret('O2SWITCH_CPANEL_TOKEN')]);validateO2Config(settings.hosting);return {config:settings.hosting,password,token}}
export function hostingFingerprint(config:O2Config,password:string,token:string){return createHash('sha256').update(JSON.stringify(config)+password+token).digest('hex')}

async function cpanel(config:O2Config,token:string,module:string,method:string,params:Record<string,string>={},api2=false):Promise<Record<string,unknown>> {
  if(!token)throw new AppError('Ajoutez le jeton API cPanel dans les paramètres d’hébergement.',503)
  const body=new URLSearchParams(api2?{cpanel_jsonapi_user:config.username,cpanel_jsonapi_apiversion:'2',cpanel_jsonapi_module:module,cpanel_jsonapi_func:method,...params}:params)
  let response:Response
  try{response=await fetch(`https://${config.host}:2083/${api2?'json-api/cpanel':`execute/${module}/${method}`}`,{method:'POST',headers:{authorization:`cpanel ${config.username}:${token}`,'content-type':'application/x-www-form-urlencoded'},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)})}catch{throw new AppError('Connexion cPanel indisponible. Vérifiez le serveur, son certificat et l’accès réseau.',502)}
  if(!response.ok)throw new AppError('cPanel a refusé la connexion. Vérifiez le jeton API et les autorisations de votre compte o2switch.',502)
  const raw=await response.json().catch(()=>null)
  const result=api2?raw?.cpanelresult:(raw?.result??raw)
  const ok=api2?result?.event?.result===1&&!(result.data as {result?:number}[]|undefined)?.some(item=>item.result===0):result?.status===1
  if(!ok)throw new AppError(api2?'o2switch n’a pas accepté l’ajout de ce domaine. Vérifiez qu’il pointe vers le serveur et qu’il n’est pas déjà utilisé dans cPanel.':'La fonction cPanel demandée est indisponible pour ce compte. Vérifiez ses autorisations.',502)
  return {data:result.data}
}

async function ftp(config:O2Config,password:string){if(!password)throw new AppError('Ajoutez le mot de passe FTPS dans les paramètres.',503);const client=new Client(20000);client.ftp.verbose=false;try{await client.access({host:config.host,user:config.username,password,port:21,secure:true,secureOptions:{minVersion:'TLSv1.2',servername:config.host}});return client}catch{client.close();throw new AppError('Connexion FTPS refusée. Vérifiez le serveur, l’identifiant et le mot de passe FTP.',502)}}
export async function testO2Connection(){
  const {config,password,token}=await credentials()
  const account=await cpanel(config,token,'DomainInfo','list_domains')
  const domains=account.data as {main_domain?:string;addon_domains?:string[];sub_domains?:string[];parked_domains?:string[]}
  const hostname=new URL(config.publicBaseUrl).hostname
  if(![domains.main_domain,...(domains.addon_domains??[]),...(domains.sub_domains??[]),...(domains.parked_domains??[])].includes(hostname))throw new AppError('L’adresse publique ne correspond à aucun domaine de ce compte cPanel. Vérifiez le domaine et le dossier associés.',400)
  const client=await ftp(config,password)
  try{await client.cd(path.posix.join('/',config.remoteBase));await client.list()}catch{throw new AppError('Le dossier FTP configuré n’est pas accessible. Vérifiez le chemin dans cPanel.',400)}finally{client.close()}
  const record={fingerprint:hostingFingerprint(config,password,token),checkedAt:new Date().toISOString()}
  await sql()`insert into kv_store(key,value) values('hosting:connection',${sql().json(record)}) on conflict(key) do update set value=excluded.value,updated_at=now()`
  return {ok:true,checkedAt:record.checkedAt,message:'cPanel et FTPS connectés. Aucun site ni domaine modifié.'}
}

function orderRoot(config:O2Config,orderId:string){if(!/^[0-9a-f-]{36}$/i.test(orderId))throw new AppError('Commande invalide',400);return path.posix.join('/',config.remoteBase,'pf-sites',orderId)}
export async function publishO2Site(orderId:string,version:WebsiteVersionData) {
  const {config,password}=await credentials(),client=await ftp(config,password),root=orderRoot(config,orderId),release=randomUUID()
  try{
    const exported=await buildSiteFiles(version)
    const publicFiles=exported.files.filter(file=>file.name==='site.css'||file.name.startsWith('assets/'))
    for(const file of publicFiles){await client.ensureDir(path.posix.join(root,'_pf',release,path.posix.dirname(file.name)));await client.uploadFrom(Readable.from([file.data]),path.posix.basename(file.name))}
    let html=String(exported.files.find(file=>file.name==='index.html')!.data)
    html=html.replaceAll('"site.css"',`"_pf/${release}/site.css"`).replaceAll('"assets/',`"_pf/${release}/assets/`).replaceAll("'assets/",`'_pf/${release}/assets/`).replaceAll('url(assets/',`url(_pf/${release}/assets/`)
    await client.ensureDir(root)
    await client.uploadFrom(Readable.from(['Options -Indexes\nDirectoryIndex index.html\n']),'.htaccess')
    const temporary=`.pf-${release}.tmp`
    try{await client.uploadFrom(Readable.from([html]),temporary);await client.rename(temporary,'index.html')}catch{await client.remove(temporary,true).catch(()=>undefined);throw new AppError('Le transfert o2switch a été interrompu avant activation. Réessayez ; les autres sites ne sont pas modifiés.',502)}
    return {url:`${config.publicBaseUrl.replace(/\/$/,'')}/pf-sites/${orderId}/`,release,warnings:exported.warnings}
  }finally{client.close()}
}
export async function suspendO2Site(orderId:string){const {config,password}=await credentials(),client=await ftp(config,password);try{await client.ensureDir(orderRoot(config,orderId));await client.uploadFrom(Readable.from(['<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Site temporairement indisponible</title><body style="font-family:system-ui;padding:8vw"><h1>Ce site est temporairement indisponible.</h1><p>Veuillez revenir plus tard.</p></body></html>']),'index.html')}finally{client.close()}}

export function normalizeCustomerDomain(value:string){const domain=value.trim().toLowerCase().replace(/\.$/,'');if(domain.length>253||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)||/\.(localhost|local|internal|test|invalid)$/.test(domain)||isIP(domain))throw new AppError('Indiquez votre domaine existant, sans https ni chemin, par exemple www.mon-entreprise.fr.',400);return domain}
export async function domainDnsStatus(domain:string,challenge:string,ip:string){
  const [addresses,txt]=await Promise.all([resolve4(domain).catch(()=>[]),resolveTxt(`_prospectforge.${domain}`).catch(()=>[])])
  return {pointsHere:addresses.some(address=>address===ip),owned:txt.some(parts=>parts.join('')===challenge)}
}
export async function mapO2Domain(orderId:string,domain:string){
  const {config,token}=await credentials()
  const existing=await cpanel(config,token,'AddonDomain','listaddondomains',{domain},true)
  const rows=existing.data as {domain?:string;fullsubdomain?:string;documentroot?:string;dir?:string}[]
  const expected=orderRoot(config,orderId).replace(/^\//,'')
  const match=rows?.find(row=>row.domain===domain)
  if(match){const root=match.documentroot??match.dir??'';if(!root.endsWith('/'+expected)&&root.replace(/^\//,'')!==expected)throw new AppError('Ce domaine est déjà relié à un autre dossier o2switch. Contactez le vendeur pour le déplacer sans écraser un site existant.',409);return}
  await cpanel(config,token,'AddonDomain','addaddondomain',{newdomain:domain,subdomain:`pf-${orderId.replaceAll('-','').slice(0,16)}`,dir:expected,ftp_is_optional:'1'},true)
  await cpanel(config,token,'SSL','start_autossl_check').catch(()=>undefined)
}
export async function domainHttpsReady(domain:string,ip:string):Promise<boolean>{
  return new Promise(resolve=>{const socket=connect({host:ip,port:443,servername:domain,rejectUnauthorized:true,minVersion:'TLSv1.2'},()=>{const ready=socket.authorized;socket.destroy();resolve(ready)});socket.setTimeout(8000,()=>{socket.destroy();resolve(false)});socket.once('error',()=>{socket.destroy();resolve(false)})})
}
