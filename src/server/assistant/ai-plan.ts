import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { AppError, NotConfiguredError, TransientError } from '../core/errors'
import { getSecret, getSettings } from '../core/settings'
import { BudgetExceededError, keyName, recordUsage, spentTodayUsd } from '../ai/client'
import { chooseModel, estimateMaxCostUsd, priceUsd } from '../ai/models'
import { SECTORS } from '@/lib/sectors'
import { TOOLS } from './tools'
import type { PlannedCall } from './rules'

const SYSTEM = `Tu es l'assistant d'un outil privé de prospection locale et de création de sites web.
Tu ne réponds pas de mémoire : tu traduis la demande de l'utilisateur en appels d'outils (un ou plusieurs, dans l'ordre).
- N'invente aucune donnée, aucun identifiant, aucun chiffre ; les résultats viennent uniquement des outils.
- Les actions coûteuses ou qui créent des données seront présentées à l'utilisateur pour confirmation : propose-les simplement.
- Tu ne peux ni envoyer d'emails ni activer une campagne : indique-le si on te le demande.
- Si aucun outil ne correspond, réponds en une phrase avec ce que tu sais faire.
Secteurs disponibles (identifiants) : ${SECTORS.map((s) => `${s.id}=${s.label}`).join(', ')}.`

function toolSchemas() {
  return TOOLS.map((t) => {
    const { $schema: _drop, ...schema } = z.toJSONSchema(t.schema, { io: 'input' }) as Record<string, unknown>
    return { name: t.name, description: `${t.description}${t.kind === 'action' ? ' (nécessite confirmation)' : ''}`, schema }
  })
}

/** Ask the configured model to plan tool calls. Tool results are never fabricated by the model. */
export async function planWithAi(message: string, selection: string[]): Promise<{ calls: PlannedCall[]; note: string | null; model: string; costUsd: number }> {
  const settings = await getSettings()
  const choice = chooseModel(settings.ai, 'assistant')
  if (!choice) throw new NotConfiguredError('Fournisseur IA', 'Paramètres → IA')
  const apiKey = await getSecret(keyName(choice.provider))
  if (!apiKey) throw new NotConfiguredError(`IA (${choice.provider})`, `renseignez ${keyName(choice.provider)}`)
  const user = `${message}\n\n(Contexte : ${selection.length} prospect(s) sélectionné(s) dans l'interface${selection.length ? ` ; identifiants : ${selection.slice(0, 200).join(', ')}` : ''}. Date : ${new Date().toISOString().slice(0, 10)}.)`
  const spent = await spentTodayUsd()
  if (spent + estimateMaxCostUsd(choice.provider, choice.model, SYSTEM.length + user.length + 4000, choice.maxTokens) > settings.ai.dailyBudgetUsd) throw new BudgetExceededError(spent, settings.ai.dailyBudgetUsd)
  const tools = toolSchemas()
  try {
    if (choice.provider === 'anthropic') {
      const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
      const fallbacks = choice.model === 'claude-opus-5-5' || choice.model === 'claude-sonnet-5-5'
      const res = await client.beta.messages.create({
        model: choice.model,
        max_tokens: choice.maxTokens,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as Anthropic.Beta.BetaTool['input_schema'] })),
        tool_choice: { type: 'auto' },
        output_config: { effort: choice.effort },
        ...(fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      })
      if (res.stop_reason === 'refusal') throw new AppError('Le modèle a refusé la requête.', 422, 'AI_REFUSAL')
      const cost = priceUsd('anthropic', res.model, res.usage.input_tokens, res.usage.output_tokens) ?? 0
      await recordUsage({ provider: 'anthropic', model: res.model, operation: 'assistant', inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, costUsd: cost })
      const calls: PlannedCall[] = []
      let note: string | null = null
      for (const b of res.content) {
        if (b.type === 'tool_use') calls.push({ tool: b.name, input: (b.input ?? {}) as Record<string, unknown> })
        else if (b.type === 'text' && b.text.trim()) note = b.text.trim()
      }
      return { calls, note, model: res.model, costUsd: cost }
    }
    const base = choice.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1'
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: choice.model,
        max_tokens: choice.maxTokens,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } })),
        tool_choice: 'auto',
        ...(choice.provider === 'openrouter' ? { usage: { include: true } } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (r.status === 429 || r.status >= 500) throw new TransientError(`${choice.provider} HTTP ${r.status}`)
    if (!r.ok) throw new AppError(`${choice.provider} HTTP ${r.status}`, 502, 'AI_ERROR')
    const body = (await r.json()) as { model?: string; usage?: { prompt_tokens: number; completion_tokens: number; cost?: number }; choices: { message: { content?: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] }
    const msg = body.choices[0]?.message
    const cost = body.usage?.cost ?? 0
    await recordUsage({ provider: choice.provider, model: body.model ?? choice.model, operation: 'assistant', inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens, costUsd: cost })
    const calls = (msg?.tool_calls ?? []).map((c) => {
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(c.function.arguments || '{}')
      } catch {
        input = { __invalid: c.function.arguments }
      }
      return { tool: c.function.name, input }
    })
    return { calls, note: msg?.content?.trim() || null, model: body.model ?? choice.model, costUsd: cost }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) throw new TransientError(`Anthropic: ${e.message}`)
    throw e
  }
}
