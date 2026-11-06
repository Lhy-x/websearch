import { z } from 'zod'

/** Bounded inputs to the trusted renderer, never model-authored executable code. */
export const glassPresentationSchema=z.object({
  fragments:z.number().int().min(3).max(7),
  depth:z.number().min(.12).max(.7),
  bevel:z.number().min(.01).max(.07),
  rotation:z.number().min(-.8).max(.8),
  spread:z.number().min(.25).max(1.3),
  turn:z.number().min(-1).max(1),
  roughness:z.number().min(.03).max(.35),
  exposure:z.number().min(1).max(2.2),
  transparent:z.boolean(),
  accent:z.enum(['none','halo','disc']),
})
export type GlassPresentation=z.infer<typeof glassPresentationSchema>

/** Art direction produced for this business, not a selection from the template catalogue. */
export const glassSceneSchema = z.object({
  silhouette: z.string().min(40).max(16000).describe('SVG original, viewBox, un seul contour fermé simple avec path ou polygon. Sans texte, script, image ni référence externe. Silhouette évocatrice du métier, pas un faux logo officiel.'),
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).length(3).describe('Trois couleurs de la direction artistique : fond, verre, accent.'),
  description: z.string().min(5).max(180).describe('Description accessible de la sculpture, sans prétendre que ce symbole est le logo officiel.'),
  presentation:glassPresentationSchema.optional(),
})
export type GlassScene = z.infer<typeof glassSceneSchema>
