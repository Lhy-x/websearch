import { randomUUID } from 'node:crypto'
import { auditLog } from '../core/audit'
import { AppError, errorMessage } from '../core/errors'
import { getSettings } from '../core/settings'
import { aiAvailability } from '../ai/client'
import { planWithAi } from './ai-plan'
import { parseCommand, type PlannedCall } from './rules'
import { TOOL_BY_NAME, type ToolResult } from './tools'

export interface AssistantStep {
  id: string
  tool: string
  kind: 'read' | 'action'
  input: Record<string, unknown>
  status: 'done' | 'needs_confirmation' | 'error'
  result?: ToolResult
  error?: string
}

export interface AssistantReply {
  interpreter: string
  note: string | null
  steps: AssistantStep[]
}

const HELP = 'Je peux : rechercher des entreprises (« recherche les plombiers à Lyon sans site »), lister des prospects, générer des démonstrations (« génère une démo pour les 5 meilleurs prospects »), préparer une campagne en brouillon, classer les campagnes par taux de réponse, lister les conversations à traiter, résumer le pipeline.'

/** Validate each planned call; run read tools now; return previews for action tools. */
async function materialise(calls: PlannedCall[]): Promise<AssistantStep[]> {
  const steps: AssistantStep[] = []
  for (const c of calls.slice(0, 5)) {
    const tool = TOOL_BY_NAME.get(c.tool)
    const id = randomUUID()
    if (!tool) {
      steps.push({ id, tool: c.tool, kind: 'read', input: c.input, status: 'error', error: 'Outil inconnu' })
      continue
    }
    const parsed = tool.schema.safeParse(c.input)
    if (!parsed.success) {
      steps.push({ id, tool: c.tool, kind: tool.kind, input: c.input, status: 'error', error: `Paramètres invalides : ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` })
      continue
    }
    const input = parsed.data as Record<string, unknown>
    try {
      if (tool.kind === 'read') steps.push({ id, tool: c.tool, kind: 'read', input, status: 'done', result: await tool.run(input) })
      else steps.push({ id, tool: c.tool, kind: 'action', input, status: 'needs_confirmation', result: tool.preview ? await tool.preview(input) : { summary: 'Action à confirmer.' } })
    } catch (e) {
      steps.push({ id, tool: c.tool, kind: tool.kind, input, status: 'error', error: errorMessage(e) })
    }
  }
  return steps
}

export async function handleAssistantMessage(message: string, selection: string[] = []): Promise<AssistantReply> {
  const settings = await getSettings()
  const avail = await aiAvailability()
  let interpreter = 'règles'
  let note: string | null = null
  let calls: PlannedCall[]
  if (avail.available && settings.ai.costMode !== 'LOW_COST') {
    try {
      const plan = await planWithAi(message, selection)
      calls = plan.calls
      note = plan.note
      interpreter = `ia:${plan.model}`
    } catch (e) {
      // AI unavailable or over budget: fall back to the deterministic parser, and say so
      calls = parseCommand(message, selection)
      note = `IA indisponible (${errorMessage(e)}) — interprétation par règles.`
    }
  } else calls = parseCommand(message, selection)
  if (!calls.length && !note) note = `Je n’ai pas compris cette demande. ${HELP}`
  const steps = await materialise(calls)
  await auditLog({ action: 'assistant.command', actor: 'admin', data: { message: message.slice(0, 500), interpreter, tools: steps.map((s) => s.tool) } })
  return { interpreter, note, steps }
}

/** Execute a confirmed action. Input is re-validated server-side; read tools can also be re-run. */
export async function executeAssistantAction(toolName: string, input: unknown): Promise<ToolResult> {
  const tool = TOOL_BY_NAME.get(toolName)
  if (!tool) throw new AppError('Outil inconnu', 400)
  const parsed = tool.schema.parse(input)
  const result = await tool.run(parsed)
  await auditLog({ action: 'assistant.execute', actor: 'admin', level: tool.kind === 'action' ? 'warn' : 'info', data: { tool: toolName, input: parsed as object, summary: result.summary } })
  return result
}
