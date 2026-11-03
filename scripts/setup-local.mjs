// Native local setup: preserves existing .env and data. Passwords never leave this machine.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, scryptSync } from 'node:crypto'
import { loadEnvFile } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { userInfo } from 'node:os'
import { emitKeypressEvents } from 'node:readline'

async function passwordPrompt() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Lancez ce script dans un terminal interactif.')
  process.stdout.write('Mot de passe PostgreSQL (Entrée si installation Homebrew sans mot de passe) : ')
  emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve, reject) => {
    let value = ''
    const done = () => { process.stdin.off('keypress', keypress); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n') }
    const keypress = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') { done(); reject(new Error('Installation annulée.')); return }
      if (key.name === 'return' || key.name === 'enter') { done(); resolve(value); return }
      if (key.name === 'backspace') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b') }; return }
      if (str && !key.ctrl && !key.meta) { value += str; process.stdout.write('*') }
    }
    process.stdin.on('keypress', keypress)
  })
}

try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 ou plus récent est requis.')
  if (!existsSync('node_modules/postgres')) throw new Error('Installez les dépendances avec npm ci, puis relancez ce script.')
  let adminPassword
  if (!existsSync('.env')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const defaultUser = process.platform === 'darwin' ? userInfo().username : 'postgres'
    const user = (await rl.question(`Utilisateur PostgreSQL [${defaultUser}] : `)).trim() || defaultUser
    rl.close()
    const dbPassword = await passwordPrompt()
    adminPassword = randomBytes(18).toString('base64url')
    const salt = randomBytes(16)
    const hash = ['scrypt', 16384, 8, 1, salt.toString('base64'), scryptSync(adminPassword, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')].join(':')
    const values = {
      DATABASE_URL: `postgres://${encodeURIComponent(user)}:${encodeURIComponent(dbPassword)}@localhost:5432/prospectforge`,
      APP_BASE_URL: 'http://localhost:3000', ADMIN_EMAIL: 'admin@local.test', ADMIN_PASSWORD_HASH: hash,
      SESSION_SECRET: randomBytes(48).toString('base64url'), APP_ENCRYPTION_KEY: randomBytes(32).toString('base64url'), EMAIL_PROVIDER: 'sandbox',
    }
    let config = readFileSync('.env.example', 'utf8')
    for (const [key, value] of Object.entries(values)) config = config.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${value}`)
    writeFileSync('.env', config, { mode: 0o600, flag: 'wx' })
    console.log(`\nCompte de l’application : admin@local.test\nMot de passe : ${adminPassword}\nNotez-le maintenant. Gardez .env privé.\n`)
  } else console.log('.env existe déjà : configuration et identifiants conservés.')
  loadEnvFile('.env')
  const { default: postgres } = await import('postgres')
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL manque dans .env.')
  const target = new URL(url)
  const database = decodeURIComponent(target.pathname.slice(1))
  if (!database) throw new Error('Le nom de base manque dans DATABASE_URL.')
  target.pathname = '/postgres'
  const db = postgres(target.toString(), { max: 1, connect_timeout: 10, onnotice: () => {} })
  try {
    const rows = await db`select 1 from pg_database where datname = ${database}`
    if (!rows.length) { await db.unsafe(`CREATE DATABASE "${database.replaceAll('"', '""')}" ENCODING 'UTF8' TEMPLATE template0`); console.log('Base de développement créée.') }
    else console.log('Base de développement existante conservée.')
  } finally { await db.end() }
  console.log('Prêt. Lancez npm run dev:local (ou LANCER-MAC.command sur Mac).')
} catch (error) {
  console.error(`Installation impossible : ${error.message}`)
  console.error('Vérifiez que PostgreSQL est démarré et que DATABASE_URL dans .env contient le bon utilisateur, mot de passe et port.')
  process.exitCode = 1
}
