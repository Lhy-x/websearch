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
if (process.env.FAKE_CLI_LOG) appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify({ flavour, argv, stdin }) + '\n')
const mode = process.env.FAKE_CLI_MODE

function nextResponse() {
  const dir = process.env.FAKE_CLI_DIR
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
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '', structured_output: out, usage: { input_tokens: 1200, output_tokens: 3400 }, modelUsage: { 'claude-test-double': {} }, total_cost_usd: 0.42 }))
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
