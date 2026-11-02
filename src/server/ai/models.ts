import type { Settings } from '../core/settings'

export type Provider = 'anthropic' | 'openai' | 'openrouter'
export type TaskKind = 'site_generation' | 'proposal' | 'reply_classification' | 'reply_draft' | 'analysis'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** USD per 1M tokens (Anthropic first-party list prices). */
export const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-fable-5-1': { input: 10, output: 50 },
}

const STRONG_TASKS: TaskKind[] = ['site_generation', 'proposal', 'reply_draft']

export interface ModelChoice {
  provider: Provider
  model: string
  effort: Effort
  maxTokens: number
}

/**
 * Model selection per task and cost mode. Settings → AI can override the cheap/strong model ids.
 *  LOW_COST:     cheap model everywhere, low effort
 *  BALANCED:     strong model for generation, cheap model for classification
 *  HIGH_QUALITY: strong model everywhere, high effort
 */
export function chooseModel(ai: Settings['ai'], task: TaskKind): ModelChoice | null {
  if (ai.provider === 'none') return null
  const defaults =
    ai.provider === 'anthropic' ? { cheap: 'claude-haiku-5-5', strong: 'claude-opus-5-5' } : { cheap: ai.cheapModel, strong: ai.strongModel }
  const cheap = ai.cheapModel || defaults.cheap
  const strong = ai.strongModel || defaults.strong
  const strongTask = STRONG_TASKS.includes(task)
  let model: string
  let effort: Effort
  switch (ai.costMode) {
    case 'LOW_COST':
      model = cheap
      effort = 'low'
      break
    case 'HIGH_QUALITY':
      model = strong
      effort = 'high'
      break
    default:
      model = strongTask ? strong : cheap
      effort = strongTask ? 'medium' : 'low'
  }
  if (!model) return null
  const maxTokens = task === 'site_generation' ? 16000 : task === 'reply_classification' ? 2000 : 8000
  return { provider: ai.provider, model, effort, maxTokens }
}

/** Cost in USD; null when the price of the model is unknown (custom OpenAI/OpenRouter models). */
export function priceUsd(provider: Provider, model: string, inputTokens: number, outputTokens: number): number | null {
  if (provider === 'anthropic') {
    const p = ANTHROPIC_PRICING[model]
    return p ? (inputTokens * p.input + outputTokens * p.output) / 1e6 : null
  }
  return null
}

/** Upper-bound estimate used by the budget guard before a call (chars/3.5 ≈ tokens). */
export function estimateMaxCostUsd(provider: Provider, model: string, promptChars: number, maxTokens: number): number {
  const p = provider === 'anthropic' ? ANTHROPIC_PRICING[model] : undefined
  const price = p ?? { input: 5, output: 25 } // conservative default for unknown models
  return ((promptChars / 3.5) * price.input + maxTokens * price.output) / 1e6
}
