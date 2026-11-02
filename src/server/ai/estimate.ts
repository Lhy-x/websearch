import { getSettings } from '../core/settings'
import { aiAvailability } from './client'
import { ANTHROPIC_PRICING, chooseModel, type TaskKind } from './models'

/** Typical token footprint per operation (measured on our prompts; conservative). */
const FOOTPRINT: Record<TaskKind, { input: number; output: number }> = {
  site_generation: { input: 2200, output: 2600 },
  proposal: { input: 1800, output: 2400 },
  reply_classification: { input: 900, output: 350 },
  reply_draft: { input: 1200, output: 600 },
  analysis: { input: 1500, output: 800 },
  assistant: { input: 2500, output: 400 },
}

/** Cost estimate shown before bulk operations. Thinking tokens are billed as output: a 1.5x margin is applied. */
export async function estimateCost(task: TaskKind, count: number) {
  const s = await getSettings()
  const avail = await aiAvailability()
  const choice = chooseModel(s.ai, task)
  if (!avail.available || !choice || s.ai.costMode === 'LOW_COST') return { ai: false, model: null, perItemUsd: 0, totalUsd: 0, note: avail.available ? 'Mode LOW_COST : génération déterministe, aucun coût IA' : `IA non configurée (${avail.reason}) : génération déterministe, aucun coût` }
  const price = choice.provider === 'anthropic' ? ANTHROPIC_PRICING[choice.model] : undefined
  if (!price) return { ai: true, model: choice.model, perItemUsd: null, totalUsd: null, note: 'Prix du modèle inconnu : coût réel enregistré après exécution' }
  const f = FOOTPRINT[task]
  const per = ((f.input * price.input + f.output * 1.5 * price.output) / 1e6)
  return { ai: true, model: choice.model, perItemUsd: per, totalUsd: per * count, note: `Estimation (${choice.model}, effort ${choice.effort}) — budget journalier ${s.ai.dailyBudgetUsd} $` }
}
