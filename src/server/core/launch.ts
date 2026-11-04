import { getSettings,getRuntimeConfig,getSecret,updateSettings } from './settings'
import { sql } from './db'
import { AppError } from './errors'
import { stripeCredentials,stripeClient,publicBase } from '../billing/stripe'
import { validateO2Config,hostingFingerprint } from '../hosting/o2switch'

export async function launchReadiness(){
  const [settings,runtime,live,ftpPassword,cpanelToken,resendKey,smtpPassword]=await Promise.all([getSettings(),getRuntimeConfig(),stripeCredentials(true),getSecret('O2SWITCH_FTP_PASSWORD'),getSecret('O2SWITCH_CPANEL_TOKEN'),getSecret('RESEND_API_KEY'),getSecret('SMTP_PASSWORD')])
  let publicUrl=false;try{publicBase(true,runtime.APP_BASE_URL);publicUrl=true}catch{}
  let hostConfigured=false;try{validateO2Config(settings.hosting);hostConfigured=!!ftpPassword&&!!cpanelToken}catch{}
  const [connection]=await sql()`select value from kv_store where key='hosting:connection'`
  const hostingChecked=hostConfigured&&connection?.value?.fingerprint===hostingFingerprint(settings.hosting,ftpPassword,cpanelToken)&&Date.now()-Date.parse(connection.value.checkedAt)<86400000
  const emailReady=runtime.EMAIL_PROVIDER==='sandbox'||runtime.EMAIL_PROVIDER==='resend'&&!!resendKey||runtime.EMAIL_PROVIDER==='smtp'&&!!runtime.SMTP_HOST&&(!runtime.SMTP_USER||!!smtpPassword)
  const checks=[
    {id:'public_url',label:'Adresse publique HTTPS du tableau de bord',ok:publicUrl,href:'/settings?tab=connections'},
    {id:'price',label:'Prix de création du site renseigné',ok:settings.commerce.enabled&&!!settings.commerce.priceCents,href:'/settings?tab=payment'},
    {id:'stripe',label:'Clé Stripe réelle et webhook permanent enregistrés',ok:!!live.key&&!!live.webhook,href:'/settings?tab=payment'},
    {id:'email',label:runtime.EMAIL_PROVIDER==='sandbox'?'Emails conservés en simulation (Sandbox choisi)':'Service email choisi configuré',ok:!!emailReady,href:'/settings?tab=connections'},
    ...(settings.hosting.enabled?[
      {id:'hosting_price',label:'Tarif mensuel d’hébergement renseigné',ok:!!settings.hosting.monthlyPriceCents,href:'/settings?tab=hosting'},
      {id:'hosting_connection',label:'Connexion cPanel / FTPS o2switch vérifiée depuis moins de 24 h',ok:!!hostingChecked,href:'/settings?tab=hosting'},
    ]:[]),
  ]
  return {mode:settings.launch.mode,ready:checks.every(check=>check.ok),checks,emailProvider:runtime.EMAIL_PROVIDER,hostingEnabled:settings.hosting.enabled}
}
export async function setLaunchMode(mode:'test'|'live'){
  if(mode==='live'){
    const readiness=await launchReadiness()
    if(!readiness.ready)throw new AppError('Configuration incomplète : '+readiness.checks.filter(check=>!check.ok).map(check=>check.label).join(' ; '),409,'LIVE_NOT_READY')
    try{await (await stripeClient(true)).balance.retrieve()}catch{throw new AppError('Stripe n’a pas validé la clé réelle. Vérifiez la clé et ses permissions avant de passer en production.',502)}
  }
  await updateSettings({launch:{mode}},{allowModeChange:true})
  return launchReadiness()
}
