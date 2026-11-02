import { z } from 'zod'

export const searchParamsSchema = z
  .object({
    country: z.enum(['FR', 'BE', 'CH']).default('FR'),
    region: z.string().trim().max(100).optional().nullable(),
    department: z.string().trim().max(100).optional().nullable(),
    city: z.string().trim().max(100).optional().nullable(),
    postcode: z.string().trim().max(10).optional().nullable(),
    lat: z.number().min(-90).max(90).optional().nullable(),
    lon: z.number().min(-180).max(180).optional().nullable(),
    radiusKm: z.number().min(0.5).max(100).default(10),
    sector: z.string().max(50).optional().nullable(),
    keywords: z.string().trim().max(200).optional().nullable(),
    sources: z.array(z.enum(['overture', 'recherche_entreprises', 'osm', 'google_places'])).optional(),
    maxResults: z.number().int().min(1).max(5000).default(500),
    // result filters (applied when listing results)
    websiteFilter: z.enum(['any', 'no_website', 'no_website_confirmed', 'has_website', 'website_issues']).default('any'),
    requireEmail: z.boolean().default(false),
    requirePhone: z.boolean().default(false),
    excludeContacted: z.boolean().default(true),
  })
  .refine((p) => (p.lat != null && p.lon != null) || !!p.city || !!p.postcode, { message: 'Ville, code postal ou coordonnées requis' })

export type SearchParams = z.infer<typeof searchParamsSchema>
