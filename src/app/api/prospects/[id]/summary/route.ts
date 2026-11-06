import {sql} from '@/server/core/db'
import {AppError} from '@/server/core/errors'
import {adminRoute} from '@/server/http/route'
import {getBusinessSummary} from '@/server/enrich/summary'

export const GET=adminRoute(async({params})=>{
 const [business]=await sql()`select id from businesses where id=${params.id} and merged_into is null`
 if(!business)throw new AppError('Prospect introuvable',404)
 const [active]=await sql()`select exists(select 1 from automation_jobs where type='business.enrich' and status in ('PENDING','RUNNING','RETRYING') and (payload->'businessIds') ? ${params.id}) enriching`
 return {summary:await getBusinessSummary(params.id),enriching:!!active?.enriching}
})
