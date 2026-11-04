import { beforeEach, afterAll, it, expect, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { resetDb, insertTestBusiness } from './helpers'
import { closeDb, sql } from '@/server/core/db'
import { env, resetEnvCache } from '@/server/core/env'
import { hashPassword, verifyPassword } from '@/server/core/crypto'
import { resetDatabase } from '@/server/maintenance/reset'
import {getRuntimeConfig,getSecret} from '@/server/core/settings'
import * as backupModule from '@/server/jobs/backup'

let directory=''
beforeEach(async()=>{await resetDb();vi.stubEnv('ADMIN_PASSWORD_HASH',await hashPassword('test-reset-password-only'));directory=await mkdtemp(path.join(tmpdir(),'pf-reset-test-'));vi.stubEnv('STORAGE_DIR',directory);resetEnvCache()})
afterAll(async()=>{await sql()`drop table if exists public.reset_external_fixture`;await closeDb();vi.unstubAllEnvs();resetEnvCache()})
it('previews counts without deleting and refuses to reset while another process uses the database',async()=>{
 await insertTestBusiness({name:'TEST Préservé'})
 expect((await resetDatabase({log:()=>{}})).applied).toBe(false)
 await expect(resetDatabase({confirm:true,log:()=>{}})).rejects.toThrow('Arrêtez l’application')
 expect((await sql()`select count(*)::int n from businesses`)[0]!.n).toBe(1)
 await rm(directory,{recursive:true,force:true})
})
it('keeps the data when the required backup cannot be created',async()=>{
 await insertTestBusiness({name:'TEST Sauvegarde impossible'});await closeDb()
 const spy=vi.spyOn(backupModule,'runBackup').mockRejectedValueOnce(new Error('Sauvegarde indisponible'))
 try{await expect(resetDatabase({confirm:true,log:()=>{}})).rejects.toThrow('Sauvegarde indisponible')}finally{spy.mockRestore()}
 expect((await sql()`select count(*)::int n from businesses`)[0]!.n).toBe(1)
 await rm(directory,{recursive:true,force:true})
})
it('creates a private SQL backup, wipes project data atomically and preserves admin access and foreign tables',async()=>{
 await insertTestBusiness({name:'TEST Effacement'})
 await sql()`create table if not exists reset_external_fixture(id integer primary key)`
 await sql()`insert into reset_external_fixture(id) values(1) on conflict do nothing`
 const [migrations]=await sql()`select count(*)::int n from schema_migrations`
 const before={email:env().ADMIN_EMAIL,hash:env().ADMIN_PASSWORD_HASH,session:env().SESSION_SECRET,encryption:env().APP_ENCRYPTION_KEY}
 vi.stubEnv('EMAIL_PROVIDER','smtp');vi.stubEnv('IMAP_HOST','imap.example.test');vi.stubEnv('OPENAI_API_KEY','test-inherited-key-only');resetEnvCache()
 await closeDb()
 const result=await resetDatabase({confirm:true,log:()=>{}})
 expect(result.applied).toBe(true)
 if(!result.applied)throw new Error('Reset non effectué')
 const file=path.join(result.backup.directory,result.backup.file)
 expect(gunzipSync(await readFile(file)).toString()).toContain('TEST Effacement')
 expect((await stat(file)).mode&0o777).toBe(0o600)
 expect((await sql()`select count(*)::int n from businesses`)[0]!.n).toBe(0)
 expect((await sql()`select count(*)::int n from website_orders`)[0]!.n).toBe(0)
 expect((await sql()`select count(*)::int n from reset_external_fixture`)[0]!.n).toBe(1)
 expect((await sql()`select count(*)::int n from schema_migrations`)[0]!.n).toBe(migrations!.n)
 const [settings]=await sql()`select data,secrets from admin_settings where id=1`
 expect(settings).toMatchObject({data:{workspaceEpoch:expect.any(String)},secrets:{}})
 expect((await getRuntimeConfig()).EMAIL_PROVIDER).toBe('sandbox');expect((await getRuntimeConfig()).IMAP_HOST).toBe('');expect(await getSecret('OPENAI_API_KEY')).toBe('')
 expect(env().ADMIN_EMAIL).toBe(before.email);expect(env().SESSION_SECRET).toBe(before.session);expect(env().APP_ENCRYPTION_KEY).toBe(before.encryption)
 expect(await verifyPassword('test-reset-password-only',env().ADMIN_PASSWORD_HASH)).toBe(true)
 await rm(directory,{recursive:true,force:true})
})
