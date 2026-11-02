const R = 6371.0088

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export interface BBox {
  xmin: number
  xmax: number
  ymin: number
  ymax: number
}

/** Bounding box enclosing a circle (not valid across the antimeridian / poles — irrelevant for FR/BE/CH). */
export function bboxAround(lat: number, lon: number, radiusKm: number): BBox {
  const dLat = radiusKm / 110.574
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))
  return { xmin: lon - dLon, xmax: lon + dLon, ymin: lat - dLat, ymax: lat + dLat }
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.xmin <= b.xmax && a.xmax >= b.xmin && a.ymin <= b.ymax && a.ymax >= b.ymin
}

export const COUNTRY_BBOX: Record<'FR' | 'BE' | 'CH', BBox> = {
  FR: { xmin: -5.3, xmax: 9.7, ymin: 41.3, ymax: 51.2 },
  BE: { xmin: 2.5, xmax: 6.5, ymin: 49.45, ymax: 51.55 },
  CH: { xmin: 5.9, xmax: 10.55, ymin: 45.8, ymax: 47.85 },
}
