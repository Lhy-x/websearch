import { parse, type HTMLElement } from 'node-html-parser'

/** Rebuild a small geometric SVG. No arbitrary XML, references, paint servers, CSS or event handlers. */
export function sanitizeSilhouette(raw: string): string {
  const root = parse(raw)
  const svg = root.querySelector('svg')
  const viewBox = svg?.getAttribute('viewBox') ?? svg?.getAttribute('viewbox') ?? ''
  const numbers = viewBox.trim().split(/[\s,]+/).map(Number)
  if (!svg || numbers.length !== 4 || numbers.some(n => !Number.isFinite(n) || Math.abs(n) > 10000) || numbers[2]! <= 0 || numbers[3]! <= 0) throw new Error('La silhouette doit avoir un viewBox valide.')
  let count = 0
  const attrs: Record<string, string[]> = { path: ['d'], polygon: ['points'], rect: ['x','y','width','height','rx','ry'], circle: ['cx','cy','r'], ellipse: ['cx','cy','rx','ry'], g: [] }
  function rebuild(node: HTMLElement): string {
    const tag = node.rawTagName?.toLowerCase()
    if (!(tag in attrs)) throw new Error('La silhouette doit contenir uniquement des formes géométriques simples.')
    if (++count > 12) throw new Error('Silhouette trop complexe (12 formes maximum).')
    const values: string[] = []
    for (const name of attrs[tag]!) {
      const value = node.getAttribute(name)
      if (value === undefined) continue
      if (name === 'd') {
        if (!/^[MmZzLlHhVvCcSsQqTtAaEe\d+.,\s-]+$/.test(value) || value.length > 10000 || !/[Zz]\s*$/.test(value) || (value.match(/[MmLlHhVvCcSsQqTtAa]/g)?.length ?? 0) > 180) throw new Error('Le tracé doit être fermé et rester simple.')
      } else if (!/^[\dEe+.,\s-]+$/.test(value) || value.length > 3000) throw new Error('Coordonnées SVG invalides.')
      const coordinates=value.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)??[]
      if(coordinates.some(n=>!Number.isFinite(Number(n))||Math.abs(Number(n))>10000)) throw new Error('Coordonnées SVG hors limites.')
      values.push(`${name}="${value}"`)
    }
    if (tag === 'path' && !node.getAttribute('d')) throw new Error('Tracé SVG vide.')
    const children = node.childNodes.filter(n => n.nodeType === 1).map(n => rebuild(n as HTMLElement)).join('')
    return `<${tag} ${values.join(' ')}>${children}</${tag}>`
  }
  const body = svg.childNodes.filter(n => n.nodeType === 1).map(n => rebuild(n as HTMLElement)).join('')
  if (!count) throw new Error('Silhouette vide.')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${numbers.join(' ')}" fill="#ffffff">${body}</svg>`
}
