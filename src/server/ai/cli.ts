import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { AppError, NotConfiguredError, TransientError } from '../core/errors'

/**
 * Subscription-backed providers: the official `claude` (Claude Pro/Max login) and `codex` (ChatGPT login)
 * command-line tools, run headless on the machine where you are logged in. No API key involved.
 *  - all tools disabled / read-only sandbox, empty temporary working directory
 *  - output constrained by a JSON Schema, then validated again with Zod
 */
export type CliProvider = 'claude-code' | 'codex'

export function cliBinary(p: CliProvider): string {
  return p === 'claude-code' ? process.env.CLAUDE_CLI_PATH || 'claude' : process.env.CODEX_CLI_PATH || 'codex'
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

function run(bin: string, args: string[], input: string | null, opts: { cwd?: string; timeoutMs: number }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, env: { ...process.env, NO_COLOR: '1', CI: '1' }, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000).unref()
    }, opts.timeoutMs)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? new NotConfiguredError(`CLI « ${bin} »`, 'introuvable : installez-le et connectez-vous (voir le tutoriel)') : e)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (signal) return reject(new TransientError(`${path.basename(bin)} interrompu (${signal}) — délai dépassé ?`))
      resolve({ code, stdout, stderr })
    })
    if (input !== null) child.stdin.end(input)
    else child.stdin.end()
  })
}

/** OpenAI structured outputs need strict schemas: every property required, no extra properties. */
export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema)
  if (!schema || typeof schema !== 'object') return schema
  const s = { ...(schema as Record<string, unknown>) }
  delete s.$schema
  delete s.default
  if (s.type === 'object' && s.properties && typeof s.properties === 'object') {
    s.properties = Object.fromEntries(Object.entries(s.properties as Record<string, unknown>).map(([k, v]) => [k, strictSchema(v)]))
    s.required = Object.keys(s.properties as object)
    s.additionalProperties = false
  }
  for (const k of ['items', 'anyOf', 'oneOf', 'allOf']) if (s[k]) s[k] = strictSchema(s[k])
  return s
}

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>
  return rest
}

function classifyFailure(provider: CliProvider, text: string): Error {
  const t = text.toLowerCase()
  if (/not logged in|please run \/login|login required|unauthori[sz]ed|authentication|not authenticated|invalid api key|401/.test(t))
    return new NotConfiguredError(provider === 'claude-code' ? 'Claude (abonnement)' : 'Codex (abonnement)', `non connecté : lancez « ${provider === 'claude-code' ? 'claude auth login' : 'codex login'} » sur cette machine`)
  if (/usage limit|rate limit|too many requests|429|quota|limit reached|overloaded|529|try again/.test(t))
    return new TransientError(`Limite de l’abonnement atteinte (${provider}) : nouvel essai plus tard`, 30 * 60_000)
  return new AppError(`${provider} : ${text.slice(0, 400) || 'erreur inconnue'}`, 502, 'AI_ERROR')
}

/** Extract a JSON object from a model answer (tolerates ```json fences and surrounding prose). */
export function extractJson(text: string): unknown {
  const t = text.trim()
  try {
    return JSON.parse(t)
  } catch {
    /* fall through */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try {
      return JSON.parse(fence[1]!)
    } catch {
      /* fall through */
    }
  }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1))
  throw new AppError('Réponse IA non JSON', 422, 'AI_INVALID_OUTPUT')
}

export interface ImageInput {
  mediaType: 'image/jpeg' | 'image/png'
  /** base64 */
  data: string
}

export interface CliCall {
  images?: ImageInput[]
  provider: CliProvider
  model?: string
  system: string
  prompt: string
  schema: z.ZodType
  timeoutMs?: number
  effort?: string
}

export interface CliOutput {
  data: unknown
  model: string
  inputTokens: number
  outputTokens: number
  /** what the CLI reports (informational: billed to the subscription, not to an API account) */
  reportedCostUsd: number | null
}

export async function callCli(c: CliCall): Promise<CliOutput> {
  const dir = await mkdtemp(path.join(tmpdir(), 'pf-ai-'))
  const timeoutMs = c.timeoutMs ?? 10 * 60_000
  try {
    if (c.provider === 'claude-code') {
      // images (visual review) are sent as content blocks through the stream-json input format: still no tools
      const withImages = !!c.images?.length
      const args = ['-p', '--output-format', withImages ? 'stream-json' : 'json', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', c.system, '--json-schema', JSON.stringify(jsonSchemaOf(c.schema))]
      if (withImages) args.push('--input-format', 'stream-json', '--verbose')
      if (c.model) args.push('--model', c.model)
      if (c.effort) args.push('--effort', c.effort)
      const input = withImages
        ? JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: c.prompt }, ...c.images!.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }))] } }) + '\n'
        : c.prompt
      const r = await run(cliBinary('claude-code'), args, input, { cwd: dir, timeoutMs })
      let out: { is_error?: boolean; result?: string; structured_output?: unknown; total_cost_usd?: number; usage?: { input_tokens?: number; output_tokens?: number }; modelUsage?: Record<string, unknown>; subtype?: string }
      try {
        const line = withImages ? r.stdout.split('\n').reverse().find((l) => l.includes('"type":"result"')) ?? '' : r.stdout
        out = JSON.parse(line)
      } catch {
        throw classifyFailure('claude-code', `${r.stderr} ${r.stdout.slice(-2000)}`)
      }
      if (out.is_error || r.code !== 0) throw classifyFailure('claude-code', `${out.result ?? ''} ${r.stderr}`)
      const data = out.structured_output ?? extractJson(out.result ?? '')
      return {
        data,
        model: c.model || Object.keys(out.modelUsage ?? {})[0] || 'claude (abonnement)',
        inputTokens: out.usage?.input_tokens ?? 0,
        outputTokens: out.usage?.output_tokens ?? 0,
        reportedCostUsd: typeof out.total_cost_usd === 'number' ? out.total_cost_usd : null,
      }
    }
    // codex: system prompt is prepended (no dedicated flag); read-only sandbox in an empty directory
    const schemaFile = path.join(dir, 'schema.json')
    const outFile = path.join(dir, 'answer.json')
    await writeFile(schemaFile, JSON.stringify(strictSchema(jsonSchemaOf(c.schema))))
    const args = ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '-C', dir, '--output-schema', schemaFile, '-o', outFile]
    if (c.model) args.push('-m', c.model)
    if (c.effort) args.push('-c', `model_reasoning_effort="${c.effort === 'max' || c.effort === 'xhigh' ? 'high' : c.effort}"`)
    for (const [i, img] of (c.images ?? []).entries()) {
      const f = path.join(dir, `capture-${i + 1}.${img.mediaType === 'image/png' ? 'png' : 'jpg'}`)
      await writeFile(f, Buffer.from(img.data, 'base64'))
      args.push('-i', f)
    }
    args.push('-')
    const prompt = `${c.system}\n\nN'exécute aucune commande et ne lis aucun fichier : réponds directement avec l'objet JSON demandé.\n\n${c.prompt}`
    const r = await run(cliBinary('codex'), args, prompt, { cwd: dir, timeoutMs })
    if (r.code !== 0) throw classifyFailure('codex', `${r.stderr} ${r.stdout}`)
    const answer = await readFile(outFile, 'utf8').catch(() => '')
    if (!answer.trim()) throw classifyFailure('codex', r.stderr || 'réponse vide')
    const tokens = r.stderr.match(/tokens used:?\s*([\d,]+)/i)
    return { data: extractJson(answer), model: c.model || 'codex (abonnement)', inputTokens: 0, outputTokens: tokens ? Number(tokens[1]!.replace(/,/g, '')) : 0, reportedCostUsd: null }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export interface CliStatus {
  installed: boolean
  loggedIn: boolean | null
  detail: string
}

const statusCache = new Map<CliProvider, { at: number; value: CliStatus }>()

/** Is the CLI installed and logged in? (cached 5 min; no model call) */
export async function cliStatus(p: CliProvider, fresh = false): Promise<CliStatus> {
  const cached = statusCache.get(p)
  if (!fresh && cached && Date.now() - cached.at < 5 * 60_000) return cached.value
  let value: CliStatus
  try {
    if (p === 'claude-code') {
      const r = await run(cliBinary(p), ['auth', 'status', '--json'], null, { timeoutMs: 20_000 })
      const j = JSON.parse(r.stdout || '{}') as { loggedIn?: boolean; authMethod?: string }
      value = { installed: true, loggedIn: !!j.loggedIn, detail: j.loggedIn ? `connecté (${j.authMethod ?? 'compte Anthropic'})` : 'non connecté : lancez « claude auth login »' }
    } else {
      const r = await run(cliBinary(p), ['login', 'status'], null, { timeoutMs: 20_000 })
      const text = `${r.stdout} ${r.stderr}`.trim()
      const ok = r.code === 0 && !/not logged in/i.test(text)
      value = { installed: true, loggedIn: ok, detail: ok ? text.split('\n').find((l) => /logged in/i.test(l)) ?? 'connecté' : 'non connecté : lancez « codex login »' }
    }
  } catch (e) {
    value = e instanceof NotConfiguredError ? { installed: false, loggedIn: false, detail: `${cliBinary(p)} introuvable` } : { installed: true, loggedIn: null, detail: (e as Error).message }
  }
  statusCache.set(p, { at: Date.now(), value })
  return value
}
