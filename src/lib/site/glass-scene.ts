import { z } from 'zod'

/** Art direction produced for this business, not a selection from the template catalogue. */
export const glassSceneSchema = z.object({
  silhouette: z.string().min(40).max(16000).describe('SVG original, viewBox, un seul contour fermé simple avec path ou polygon. Sans texte, script, image ni référence externe. Silhouette évocatrice du métier, pas un faux logo officiel.'),
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).length(3).describe('Trois couleurs de la direction artistique : fond, verre, accent.'),
  description: z.string().min(5).max(180).describe('Description accessible de la sculpture, sans prétendre que ce symbole est le logo officiel.'),
})
export type GlassScene = z.infer<typeof glassSceneSchema>
