import { loadEnvFile } from 'node:process'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
if(Number(process.versions.node.split('.')[0])<22){console.error('Node.js 22 ou plus récent est requis.');process.exit(1)}
if(!existsSync('.env')){console.error('Lancez cette commande dans le projet installé sur votre machine (.env requis).');process.exit(1)}
loadEnvFile('.env')
const child=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/reset-database.ts',...process.argv.slice(2)],{stdio:'inherit',env:process.env})
child.on('error',()=>{console.error('Impossible de lancer la remise à zéro. Vérifiez npm ci et votre version de Node.');process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
