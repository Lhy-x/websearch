import {expireWebsiteCheckouts} from '../billing/orders'
import {sql} from '../core/db'
import {AppError} from '../core/errors'
import {auditLog} from '../core/audit'
export async function trashWebsite(id:string,restore=false) {
 if(!restore)await expireWebsiteCheckouts(id)
 const result=await sql().begin(async tx=>{
  const [site]=await tx`select id,deleted_at,status from generated_websites where id=${id} for update`
  if(!site)throw new AppError('Site introuvable',404)
  if(site.status==='GENERATING'&&!restore)throw new AppError('Attendez la fin de la génération avant de supprimer ce site.',409)
  if(!restore){const [pending]=await tx`select id from website_orders where website_id=${id} and status in ('CREATING','OPEN','PENDING')`;if(pending)throw new AppError('Un paiement vient d’être ouvert. Réessayez après sa fermeture.',409)}
  await tx`update generated_websites set deleted_at=${restore?null:new Date()} where id=${id}`
  if(!restore)await tx`update automation_jobs set status='CANCELLED',finished_at=now(),error='Site placé dans la corbeille' where payload->>'websiteId'=${id} and status in ('PENDING','RETRYING')`
  return {ok:true}
 })
 await auditLog({action:restore?'website.restored':'website.trashed',entityType:'website',entityId:id,actor:'admin'})
 return result
}
