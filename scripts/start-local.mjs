// Starts the dashboard and its required worker together, with .env loaded for both.
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { spawn } from 'node:child_process'

const missing=[]
if(Number(process.versions.node.split('.')[0])<22)missing.push('Node.js 22 ou plus récent (version actuelle : '+process.version+')')
if(!existsSync('.env'))missing.push('Configuration locale .env : lancez npm run setup:local')
if(!existsSync('node_modules/next'))missing.push('Dépendances : lancez npm ci')
if(missing.length){console.error('Il manque :\n'+missing.map(m=>'• '+m).join('\n'));process.exit(1)}
loadEnvFile('.env')
const children = new Set()
let stopping = false
function launch(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env })
  children.add(child)
  child.once('exit', () => children.delete(child))
  child.on('error', error => { console.error(error.message); stop(1) })
  return child
}
function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGTERM')
  }
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
const migration = launch(['node_modules/tsx/dist/cli.mjs', 'scripts/migrate.ts'])
migration.once('exit', code => {
  if (stopping) return
  if (code !== 0) { stop(code ?? 1); return }
  console.log('\nOuverture : http://localhost:' + (process.env.PORT || '3000') + '\nGardez cette fenêtre ouverte. Ctrl+C pour arrêter.\n')
  const worker = launch(['node_modules/tsx/dist/cli.mjs', 'src/worker/main.ts'])
  const web = launch(['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', process.env.PORT || '3000'])
  for (const child of [worker, web]) child.once('exit', code => { if (!stopping) stop(code || 1) })
})
