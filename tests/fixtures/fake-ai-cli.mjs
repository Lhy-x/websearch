#!/usr/bin/env node
// TEST DOUBLE for the `claude` and `codex` CLIs (never used outside tests).
// Behaviour is driven by env vars:
//   FAKE_CLI_DIR        directory holding response-1.json, response-2.json… (consumed in order)
//   FAKE_CLI_LOG        file where each invocation (argv + stdin) is appended as JSON lines
//   FAKE_CLI_MODE       "notloggedin" | "limit" to simulate failures
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const flavour = process.argv[2] === 'codex' ? 'codex' : 'claude'
const argv = process.argv.slice(3)
const generating = (flavour === 'claude' && argv.includes('-p')) || (flavour === 'codex' && argv[0] === 'exec')
const stdin = generating
  ? await new Promise((resolve) => {
      let s = ''
      process.stdin.on('data', (d) => (s += d))
      process.stdin.on('end', () => resolve(s))
    })
  : ''
const requestedSchema = generating ? JSON.parse(flavour==='claude' ? argv[argv.indexOf('--json-schema')+1] || '{}' : readFileSync(argv[argv.indexOf('--output-schema')+1],'utf8')) : {}
const phase=requestedSchema.properties?.candidates?'direction':'generation'
if (process.env.FAKE_CLI_LOG) appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify({ flavour, argv, stdin,phase }) + '\n')
const mode = process.env.FAKE_CLI_MODE

function nextResponse() {
  const dir = process.env.FAKE_CLI_DIR
  if(phase==='direction'){
    const counterFile=path.join(dir,'direction-counter')
    const n=existsSync(counterFile)?Number(readFileSync(counterFile,'utf8'))+1:1
    writeFileSync(counterFile,String(n))
    const explicit=path.join(dir,`direction-${n}.json`),fallback=path.join(dir,'direction-default.json')
    if(existsSync(explicit)||existsSync(fallback))return JSON.parse(readFileSync(existsSync(explicit)?explicit:fallback,'utf8'))
    const source=stdin.match(/<faits_direction>([\s\S]*?)<\/faits_direction>/)
    const facts=source?JSON.parse(source[1]):{name:'TEST Fixture',activity:'Commerce local',city:'Rouen'}
    const ids=Object.keys(facts).filter(id=>['name','activity','city','publicDetails','officialText'].includes(id))
    const occupiedText=stdin.split('Créations voisines à distinguer : ')[1] || ''
    const selected=!occupiedText.includes('TEST Colonne éditoriale')?0:!occupiedText.includes('TEST Affiche graphique')?1:2
    const evidence=ids.slice(0,6).map(id=>({id,quote:String(facts[id]).slice(0,160),decision:'TEST : ce fait vérifié guide le contenu et la composition.'}))
    return {evidence,candidates:[
      {name:'TEST Colonne éditoriale',idea:'TEST : une composition narrative fondée sur les faits transmis.',hero:'TEST : un titre ample au-dessus des informations et un appel direct en colonne.',sections:[{purpose:'Présenter le commerce',title:'Le lieu',layout:'Une colonne de texte ample et lisible.'},{purpose:'Permettre le contact',title:'Venir et appeler',layout:'Une adresse suivie des liens de contact.'}],typography:{display:'Fraunces',body:'Georgia'},palette:['#f6f7f2','#1f2a2e','#7d9a86','#b08d57'],scene:{symbol:'TEST : silhouette originale associée aux faits de ce commerce.',placement:'TEST : sous le contenu dans un espace ouvert.',presentation:{fragments:4,depth:.35,bevel:.035,rotation:0,spread:.8,turn:.7,roughness:.08,exposure:1.8,transparent:true,accent:'none'}}},
      {name:'TEST Affiche graphique',idea:'TEST : une affiche avec une hiérarchie verticale contrastée.',hero:'TEST : ouverture en affiche centrale avec titre compact dans un cercle.',sections:[{purpose:'Situer l’activité',title:'Le quartier',layout:'Une bande horizontale avec légendes.'},{purpose:'Faciliter la prise de contact',title:'Nous joindre',layout:'Deux colonnes et un index latéral.'}],typography:{display:'Bodoni Moda',body:'Manrope'},palette:['#ffffff','#141414','#da6338','#e8e8e8'],scene:{symbol:'TEST : signe courbe abstrait inventé pour cette activité.',placement:'TEST : dans la marge latérale de l’affiche.',presentation:{fragments:3,depth:.2,bevel:.02,rotation:.4,spread:.4,turn:-.4,roughness:.2,exposure:1.2,transparent:false,accent:'halo'}}},
      {name:'TEST Composition architecturale',idea:'TEST : une lecture par alignements et grandes légendes précises.',hero:'TEST : titre étroit sur le bord gauche et grande scène cadrée en bas de page.',sections:[{purpose:'Montrer les informations vérifiées',title:'Repères',layout:'Une grille asymétrique avec filets.'},{purpose:'Organiser l’accès',title:'Accès',layout:'Une grande composition de coordonnées.'}],typography:{display:'DM Serif Display',body:'Karla'},palette:['#fffaf4','#261d18','#ad693c','#e9d8bf'],scene:{symbol:'TEST : contour angulaire compact original, sans logo officiel.',placement:'TEST : en fin de récit comme repère de contact.',presentation:{fragments:5,depth:.5,bevel:.05,rotation:-.3,spread:1.1,turn:.2,roughness:.1,exposure:2,transparent:true,accent:'none'}}}
    ],selected,rationale:'TEST : le premier concept traduit les faits connus sans inventer de prestations.'}
  }
  const counterFile = path.join(dir, 'counter')
  const n = existsSync(counterFile) ? Number(readFileSync(counterFile, 'utf8')) + 1 : 1
  writeFileSync(counterFile, String(n))
  const f = path.join(dir, `response-${n}.json`)
  return JSON.parse(readFileSync(existsSync(f) ? f : path.join(dir, 'response-default.json'), 'utf8'))
}

if (flavour === 'claude') {
  if (argv[0] === 'auth' && argv[1] === 'status') {
    console.log(JSON.stringify(mode === 'notloggedin' ? { loggedIn: false } : { loggedIn: true, authMethod: 'claude.ai (test double)' }))
    process.exit(0)
  }
  if (mode === 'notloggedin') {
    console.log(JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in · Please run /login' }))
    process.exit(1)
  }
  if (mode === 'limit') {
    console.log(JSON.stringify({ type: 'result', is_error: true, result: 'Claude usage limit reached. Your limit will reset at 5pm.' }))
    process.exit(1)
  }
  const out = nextResponse()
  const result = { type: 'result', subtype: 'success', is_error: false, result: '', structured_output: out, usage: { input_tokens: 1200, output_tokens: 3400 }, modelUsage: { 'claude-test-double': {} }, total_cost_usd: 0.42 }
  if (argv.includes('--input-format')) {
    // stream-json: a user message with content blocks (text + images) in, event lines out
    const msg = JSON.parse(stdin.trim().split('\n')[0])
    const images = msg.message.content.filter((b) => b.type === 'image').length
    if (process.env.FAKE_CLI_LOG) appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify({ flavour, images }) + '\n')
    console.log(JSON.stringify({ type: 'system', subtype: 'init' }))
    console.log(JSON.stringify(result))
  } else console.log(JSON.stringify(result))
  process.exit(0)
}
// codex
if (argv[0] === 'login' && argv[1] === 'status') {
  if (mode === 'notloggedin') {
    console.error('Not logged in')
    process.exit(1)
  }
  console.log('Logged in using ChatGPT (test double)')
  process.exit(0)
}
if (argv[0] === 'exec') {
  const outFile = argv[argv.indexOf('-o') + 1]
  const schemaFile = argv[argv.indexOf('--output-schema') + 1]
  const schema = JSON.parse(readFileSync(schemaFile, 'utf8'))
  if (schema.additionalProperties !== false) {
    console.error('schema not strict')
    process.exit(2)
  }
  writeFileSync(outFile, JSON.stringify(nextResponse()))
  console.error('tokens used: 4,321')
  process.exit(0)
}
process.exit(64)
