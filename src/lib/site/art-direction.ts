import {z} from 'zod'
import {glassPresentationSchema} from './glass-scene'
// Real, loadable families; typography tools, never prebuilt page layouts.
export const GOOGLE_DESIGN_FONTS=['Fraunces','DM Serif Display','Bodoni Moda','Playfair Display','Cormorant Garamond','Libre Baskerville','Lora','Spectral','Prata','Instrument Serif','Abril Fatface','Syne','Space Grotesk','Outfit','Manrope','DM Sans','Sora','Karla','Work Sans','Barlow','Urbanist','Archivo','Bricolage Grotesque','Newsreader','IBM Plex Sans','IBM Plex Mono','Azeret Mono','Red Hat Display','Rubik','Nunito Sans'] as const
export const SYSTEM_DESIGN_FONTS=['Georgia','Arial','Verdana','Trebuchet MS','Palatino Linotype','Times New Roman','system-ui'] as const
const fontFamily=z.enum([...GOOGLE_DESIGN_FONTS,...SYSTEM_DESIGN_FONTS])

export const creativeConceptSchema=z.object({
 name:z.string().min(5).max(100),
 idea:z.string().min(20).max(700),
 hero:z.string().min(20).max(600).describe('Composition concrète du premier écran : positions, proportions, relation entre titre, contenu, scène et CTA'),
 sections:z.array(z.object({purpose:z.string().min(5).max(150),title:z.string().min(3).max(100),layout:z.string().min(12).max(300)})).min(2).max(7),
 typography:z.object({display:fontFamily.describe('Nom exact d’une famille unique à appliquer au h1, sans commentaire ni liste de replis'),body:fontFamily.describe('Nom exact d’une famille unique à appliquer au body, sans commentaire ni liste de replis')}),
 palette:z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(4).max(6),
 scene:z.object({symbol:z.string().min(12).max(300),placement:z.string().min(12).max(300),presentation:glassPresentationSchema}),
})
export const directionResponseSchema=z.object({
 evidence:z.array(z.object({id:z.string().max(80),quote:z.string().min(2).max(300),decision:z.string().min(12).max(400)})).min(2).max(6),
 candidates:z.array(creativeConceptSchema).length(3),
 selected:z.number().int().min(0).max(2),
 rationale:z.string().min(20).max(700),
})
export type CreativeConcept=z.infer<typeof creativeConceptSchema>
export type ArtDirection={version:2;evidence:z.infer<typeof directionResponseSchema>['evidence'];concept:CreativeConcept;rationale:string}
