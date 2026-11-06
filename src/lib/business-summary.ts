import {z} from 'zod'

export const summaryEvidenceSchema=z.object({
 label:z.string().max(160),
 kind:z.enum(['website','manual','public_data','record']),
 url:z.string().url().refine(value=>/^https?:\/\//i.test(value)).nullable(),
 excerpt:z.string().min(2).max(600),
})
export const summaryClaimSchema=z.object({text:z.string().min(2).max(650),evidence:z.array(summaryEvidenceSchema).min(1).max(2)})
export const businessSummarySchema=z.object({
 version:z.literal(1),
 activity:summaryClaimSchema,
 advantages:z.array(summaryClaimSchema).max(4),
 coverage:z.enum(['documented','partial','limited']),
 method:z.enum(['sources','ai_selection']),
 updatedAt:z.string(),
 builtFromAt:z.string(),
 sourceHash:z.string(),
})
export type SummaryEvidence=z.infer<typeof summaryEvidenceSchema>
export type SummaryClaim=z.infer<typeof summaryClaimSchema>
export type BusinessSummary=z.infer<typeof businessSummarySchema>

export function readBusinessSummary(value:unknown):BusinessSummary|null{
 const parsed=businessSummarySchema.safeParse(value)
 return parsed.success?parsed.data:null
}
