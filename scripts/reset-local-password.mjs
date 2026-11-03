import {readFileSync,writeFileSync} from 'node:fs'
import {randomBytes,scryptSync} from 'node:crypto'
try {
  let config=readFileSync('.env','utf8')
  const password=randomBytes(18).toString('base64url')
  const salt=randomBytes(16)
  const hash=['scrypt',16384,8,1,salt.toString('base64'),scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('base64')].join(':')
  for(const [key,value] of Object.entries({ADMIN_PASSWORD_HASH:hash,SESSION_SECRET:randomBytes(48).toString('base64url')})) {
    const pattern=new RegExp(`^${key}=.*$`,'m')
    config=pattern.test(config)?config.replace(pattern,()=>`${key}=${value}`):config+`\n${key}=${value}\n`
  }
  writeFileSync('.env',config,{mode:0o600})
  console.log(`Nouveau mot de passe administrateur : ${password}\nNotez-le. Relancez l’application ; les anciennes sessions seront invalidées. Votre email, vos données et les autres réglages sont conservés.`)
} catch { console.error('Impossible de modifier .env. Lancez cette commande depuis le dossier du projet après son installation.');process.exitCode=1 }
