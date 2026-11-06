import { getSettings } from '../core/settings'
import { aiAvailability } from './client'
import { ANTHROPIC_PRICING, chooseModel, isSubscription, type TaskKind } from './models'
import { callsToday } from './client'

/** Typical token footprint per operation (measured on our prompts; conservative). */
const FOOTPRINT: Record<TaskKind, { input: number; output: number }> = {
  site_direction:{input:5000,output:3500},
  site_generation: { input: 2200, output: 2600 },
  site_bespoke: { input: 9000, output: 20000 },
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
  if(task === 'site_bespoke' && (!avail.available || !choice)) return {ai:false,model:null,perItemUsd:null,totalUsd:null,note:'IA requise pour la création sur mesure : '+(avail.reason??'fournisseur à configurer')+'. Aucun template ne sera utilisé.'}
  if (!avail.available || !choice || (s.ai.costMode === 'LOW_COST' && !['site_bespoke','site_direction'].includes(task))) return { ai: false, model: null, perItemUsd: 0, totalUsd: 0, note: avail.available ? 'Mode LOW_COST : génération déterministe, aucun coût IA' : `IA non configurée (${avail.reason}) : génération déterministe, aucun coût` }
  if (isSubscription(choice.provider)) {
    const used = await callsToday(choice.provider)
    return { ai: true, model: choice.model || choice.provider, perItemUsd: 0, totalUsd: 0, note: `Abonnement (${choice.provider}) : aucun coût par appel. Appels aujourd’hui : ${used}/${s.ai.subscriptionDailyCalls}${task === 'site_bespoke' ? ' — un site comprend une conception individuelle puis le HTML, la critique et les corrections ; une reconception ajoute des appels, chacun soumis au plafond'  : ''}.` }
  }
  const price = choice.provider === 'anthropic' ? ANTHROPIC_PRICING[choice.model] : undefined
  if (!price) return { ai: true, model: choice.model, perItemUsd: null, totalUsd: null, note: 'Prix du modèle inconnu : coût réel enregistré après exécution' }
  const footprint=FOOTPRINT[task]
  const f=task==='site_bespoke'?{input:footprint.input+FOOTPRINT.site_direction.input,output:footprint.output+FOOTPRINT.site_direction.output}:footprint
  const per = ((f.input * price.input + f.output * 1.5 * price.output) / 1e6)
  return { ai: true, model: choice.model, perItemUsd: per, totalUsd: per * count, note: `Estimation (${choice.model}, effort ${choice.effort}) — budget journalier ${s.ai.dailyBudgetUsd} $` }
}
