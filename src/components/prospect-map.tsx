'use client'
import { useEffect, useRef } from 'react'
import type { Map as LMap } from 'leaflet'

export interface MapPoint {
  id: string
  name: string
  lat: number
  lon: number
  score: number | null
  presence: string
}

/** Leaflet map (OSM tiles). Colour = presence (green: no website, orange: website issues, grey: website ok). */
export function ProspectMap({ points, center, radiusKm, height = 520 }: { points: MapPoint[]; center?: [number, number] | null; radiusKm?: number; height?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LMap | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !el.current) return
      if (!map.current) {
        map.current = L.map(el.current, { scrollWheelZoom: true })
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map.current)
      }
      const m = map.current
      m.eachLayer((l) => {
        if (!(l instanceof L.TileLayer)) m.removeLayer(l)
      })
      const color = (p: string) => (p.startsWith('NO_WEBSITE') ? '#16a34a' : ['WEBSITE_BROKEN', 'WEBSITE_OUTDATED', 'WEBSITE_LOW_QUALITY'].includes(p) ? '#ea580c' : '#6b7280')
      const bounds: [number, number][] = []
      for (const p of points) {
        L.circleMarker([p.lat, p.lon], { radius: 6, color: color(p.presence), weight: 1, fillOpacity: 0.75 })
          .bindPopup(`<a href="/prospects/${p.id}"><b>${p.name.replace(/</g, '&lt;')}</b></a><br/>Score : ${p.score ?? '—'}`)
          .addTo(m)
        bounds.push([p.lat, p.lon])
      }
      if (center && radiusKm) L.circle(center, { radius: radiusKm * 1000, color: '#6366f1', weight: 1, fillOpacity: 0.04 }).addTo(m)
      if (bounds.length) m.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
      else if (center) m.setView(center, 12)
      else m.setView([46.6, 2.4], 5)
    })()
    return () => {
      cancelled = true
    }
  }, [points, center, radiusKm])
  useEffect(() => () => {
    map.current?.remove()
    map.current = null
  }, [])
  return <div ref={el} style={{ height }} className="w-full rounded-xl border border-border" />
}
