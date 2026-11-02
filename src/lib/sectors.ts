/**
 * Sector taxonomy shared by search connectors, scoring and site templates.
 * - overture: Overture "taxonomy.primary" values (release 2026-10) matched exactly
 * - naf: French NAF rev.2 codes (API Sirene / recherche-entreprises)
 * - osm: OpenStreetMap tag filters  [key, value]
 * - nameHints: regex on the business name used to refine ambiguous categories (e.g. barber vs hair salon)
 */
export interface SectorDef {
  id: string
  label: string
  templateId: string
  overture: string[]
  naf: string[]
  osm: [string, string][]
  nameHints?: RegExp
  /** Default relevance for our web-design offer, 0..1 (configurable via target sectors) */
  relevance: number
}

export const SECTORS: SectorDef[] = [
  { id: 'hair_salon', label: 'Coiffeur', templateId: 'coiffeur', overture: ['hair_salon', 'hair_replacement', 'hair_stylist'], naf: ['96.02A'], osm: [['shop', 'hairdresser']], relevance: 1 },
  { id: 'barber', label: 'Barbier', templateId: 'barbier', overture: ['barber'], naf: ['96.02A'], osm: [['shop', 'hairdresser'], ['hairdresser', 'barber']], nameHints: /barb(er|ier)|barbershop/i, relevance: 1 },
  { id: 'beauty_salon', label: 'Institut de beauté', templateId: 'coiffeur', overture: ['beauty_salon', 'nail_salon', 'eyelash_service', 'skin_care', 'massage', 'spa', 'day_spa', 'waxing', 'laser_hair_removal', 'hair_removal'], naf: ['96.02B', '96.04Z'], osm: [['shop', 'beauty']], relevance: 0.95 },
  { id: 'restaurant', label: 'Restaurant', templateId: 'restaurant', overture: ['restaurant', 'french_restaurant', 'italian_restaurant', 'pizza_restaurant', 'brasserie', 'bistro', 'japanese_restaurant', 'sushi_restaurant', 'asian_restaurant', 'chinese_restaurant', 'indian_restaurant', 'vietnamese_restaurant', 'thai_restaurant', 'lebanese_restaurant', 'moroccan_restaurant', 'seafood_restaurant', 'burger_restaurant', 'bar_and_grill_restaurant', 'mediterranean_restaurant', 'korean_restaurant', 'turkish_restaurant', 'portuguese_restaurant', 'spanish_restaurant', 'mexican_restaurant', 'vegetarian_restaurant', 'vegan_restaurant', 'haute_cuisine_restaurant', 'breakfast_and_brunch_restaurant', 'creperie', 'european_restaurant', 'african_restaurant', 'american_restaurant', 'middle_eastern_restaurant', 'fondue_restaurant', 'buffet_restaurant', 'halal_restaurant', 'ramen_restaurant'], naf: ['56.10A', '56.10B'], osm: [['amenity', 'restaurant']], relevance: 0.9 },
  { id: 'fast_food', label: 'Restauration rapide', templateId: 'restaurant', overture: ['fast_food_restaurant', 'doner_kebab_restaurant', 'sandwich_shop', 'pizza_delivery_service', 'chicken_restaurant', 'taco_restaurant', 'poke_restaurant', 'hot_dog_restaurant', 'fish_and_chips_restaurant'], naf: ['56.10C'], osm: [['amenity', 'fast_food']], relevance: 0.6 },
  { id: 'cafe', label: 'Café / bar', templateId: 'cafe', overture: ['cafe', 'coffee_shop', 'tea_room', 'coffee_roastery', 'bar', 'wine_bar', 'pub', 'cat_cafe'], naf: ['56.30Z'], osm: [['amenity', 'cafe'], ['amenity', 'bar']], relevance: 0.8 },
  { id: 'bakery', label: 'Boulangerie / pâtisserie', templateId: 'boulangerie', overture: ['bakery', 'patisserie', 'pastry_shop', 'chocolatier', 'cake_shop'], naf: ['10.71C', '10.71D', '47.24Z'], osm: [['shop', 'bakery'], ['shop', 'pastry']], relevance: 0.85 },
  { id: 'plumber', label: 'Plombier / chauffagiste', templateId: 'plombier', overture: ['plumbing', 'plumber', 'hvac_services', 'heating_and_air_conditioning', 'water_heater_installation_repair'], naf: ['43.22A', '43.22B'], osm: [['craft', 'plumber'], ['craft', 'hvac']], relevance: 1 },
  { id: 'electrician', label: 'Électricien', templateId: 'electricien', overture: ['electrician', 'electrical_services'], naf: ['43.21A'], osm: [['craft', 'electrician']], relevance: 1 },
  { id: 'garage', label: 'Garage automobile', templateId: 'garage', overture: ['automotive_repair', 'auto_body_shop', 'auto_glass_service', 'auto_detailing', 'automotive_service', 'tire_dealer_and_repair', 'oil_change_station', 'car_wash', 'used_auto_dealer'], naf: ['45.20A', '45.20B', '45.11Z'], osm: [['shop', 'car_repair']], relevance: 0.95 },
  { id: 'cleaning', label: 'Entreprise de nettoyage', templateId: 'nettoyage', overture: ['cleaning_service', 'home_cleaning', 'commercial_cleaning', 'carpet_cleaning', 'window_washing', 'pool_cleaning'], naf: ['81.21Z', '81.22Z', '81.29A', '81.29B'], osm: [['office', 'cleaning']], relevance: 0.95 },
  { id: 'real_estate', label: 'Agence immobilière', templateId: 'immobilier', overture: ['real_estate_agent', 'real_estate_service', 'real_estate_agency', 'property_management', 'commercial_real_estate'], naf: ['68.31Z', '68.32A'], osm: [['office', 'estate_agent']], relevance: 0.75 },
  { id: 'architect', label: 'Architecte', templateId: 'architecte', overture: ['architect', 'architectural_designer', 'landscape_architect', 'interior_design'], naf: ['71.11Z', '74.10Z'], osm: [['office', 'architect']], relevance: 0.85 },
  { id: 'consulting', label: 'Cabinet de conseil', templateId: 'conseil', overture: ['business_consulting', 'it_consultant', 'b2b_marketing_consultant', 'management_consultant', 'business_management_services', 'accountant', 'image_consultant'], naf: ['70.22Z', '62.02A', '69.20Z'], osm: [['office', 'consulting']], relevance: 0.7 },
  { id: 'photographer', label: 'Photographe', templateId: 'photographe', overture: ['photography_service', 'event_photography_service', 'photographer', 'wedding_photography', 'photography_studio'], naf: ['74.20Z'], osm: [['craft', 'photographer'], ['shop', 'photo']], relevance: 0.9 },
  { id: 'artisan', label: 'Artisan du bâtiment', templateId: 'artisan', overture: ['contractor', 'carpenter', 'painting', 'roofing', 'masonry_contractor', 'masonry_concrete', 'flooring_contractor', 'building_contractor', 'handyman', 'tiling', 'key_and_locksmith', 'landscaping', 'glass_and_mirror_sales_service', 'cabinetry', 'kitchen_remodeling', 'bathroom_remodeling', 'insulation_installation', 'gardener'], naf: ['43.32A', '43.34Z', '43.99C', '43.91B', '43.33Z', '43.31Z', '43.39Z', '81.30Z', '16.23Z'], osm: [['craft', 'carpenter'], ['craft', 'painter'], ['craft', 'roofer'], ['craft', 'tiler'], ['craft', 'stonemason'], ['craft', 'locksmith']], relevance: 1 },
  { id: 'florist', label: 'Fleuriste', templateId: 'generique', overture: ['florist', 'flowers_and_gifts_store'], naf: ['47.76Z'], osm: [['shop', 'florist']], relevance: 0.8 },
  { id: 'butcher', label: 'Boucherie / traiteur', templateId: 'boulangerie', overture: ['butcher_shop', 'caterer', 'delicatessen', 'cheese_shop'], naf: ['47.22Z', '10.13B', '56.21Z'], osm: [['shop', 'butcher'], ['shop', 'deli']], relevance: 0.75 },
]

export const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]))

const OVERTURE_INDEX = new Map<string, string>()
for (const s of SECTORS) for (const c of s.overture) if (!OVERTURE_INDEX.has(c)) OVERTURE_INDEX.set(c, s.id)

/** Map an Overture taxonomy (primary + hierarchy) + name to our sector id. */
export function sectorFromOverture(primary: string | null | undefined, hierarchy: string[] = [], name = ''): string | null {
  if (primary === 'hair_salon' || primary === 'barber') {
    if (/barb(er|ier)|barbershop/i.test(name)) return 'barber'
  }
  if (primary && OVERTURE_INDEX.has(primary)) return OVERTURE_INDEX.get(primary)!
  for (const h of [...hierarchy].reverse()) if (OVERTURE_INDEX.has(h)) return OVERTURE_INDEX.get(h)!
  if (primary?.endsWith('_restaurant')) return 'restaurant'
  return null
}

export function sectorFromNaf(naf: string | null | undefined, name = ''): string | null {
  if (!naf) return null
  if (naf === '96.02A' && /barb(er|ier)|barbershop/i.test(name)) return 'barber'
  for (const s of SECTORS) if (s.naf.includes(naf)) return s.id
  return null
}

/** Overture category codes to accept for a given sector search. */
export function overtureCodesFor(sectorId: string): Set<string> {
  const s = SECTOR_BY_ID.get(sectorId)
  if (!s) return new Set()
  const out = new Set(s.overture)
  // hair salon and barber overlap heavily in the data: search both and refine by name
  if (sectorId === 'barber') SECTOR_BY_ID.get('hair_salon')!.overture.forEach((c) => out.add(c))
  return out
}
