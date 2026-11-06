import type { Settings } from '../core/settings'

export type Provider = 'anthropic' | 'openai' | 'openrouter' | 'claude-code' | 'codex'
export const SUBSCRIPTION_PROVIDERS: Provider[] = ['claude-code', 'codex']
export const isSubscription = (p: Provider) => SUBSCRIPTION_PROVIDERS.includes(p)
export type TaskKind = 'site_generation' | 'site_direction' | 'site_bespoke' | 'proposal' | 'reply_classification' | 'reply_draft' | 'analysis' | 'assistant'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** USD per 1M tokens (Anthropic first-party list prices). */
export const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-fable-5-1': { input: 10, output: 50 },
}

const STRONG_TASKS: TaskKind[] = ['site_generation', 'site_bespoke', 'proposal', 'reply_draft']

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
    ai.provider === 'anthropic'
      ? { cheap: 'claude-haiku-5-5', strong: 'claude-opus-5-5' }
      : ai.provider === 'claude-code'
        ? { cheap: 'haiku', strong: 'opus' } // aliases resolved by the Claude CLI to the latest models of your plan
        : { cheap: ai.cheapModel, strong: ai.strongModel }
  const cheap = ai.cheapModel || defaults.cheap
  const strong = ai.strongModel || defaults.strong
  const sub = isSubscription(ai.provider)
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
  // the bespoke site is the flagship output: always the strong model, high effort
  if (task === 'site_bespoke'||task==='site_direction') {
    model = strong
    effort = ai.costMode === 'LOW_COST' ? 'medium' : 'high'
  }
  if (!model && !sub) return null
  const maxTokens = task === 'site_direction'?6000:task === 'site_bespoke' ? 64000 : task === 'site_generation' ? 16000 : task === 'reply_classification' || task === 'assistant' ? 2000 : 8000
  return { provider: ai.provider, model, effort, maxTokens }
}

/** Cost in USD; null when the price of the model is unknown (custom OpenAI/OpenRouter models). */
export function priceUsd(provider: Provider, model: string, inputTokens: number, outputTokens: number): number | null {
  if (isSubscription(provider)) return 0
  if (provider === 'anthropic') {
    const p = ANTHROPIC_PRICING[model]
    return p ? (inputTokens * p.input + outputTokens * p.output) / 1e6 : null
  }
  return null
}

/** Upper-bound estimate used by the budget guard before a call (chars/3.5 ≈ tokens). */
export function estimateMaxCostUsd(provider: Provider, model: string, promptChars: number, maxTokens: number): number {
  if (isSubscription(provider)) return 0
  const p = provider === 'anthropic' ? ANTHROPIC_PRICING[model] : undefined
  const price = p ?? { input: 5, output: 25 } // conservative default for unknown models
  return ((promptChars / 3.5) * price.input + maxTokens * price.output) / 1e6
}
