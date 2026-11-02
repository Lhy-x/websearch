import { createElement } from 'react'
import type { IconName } from '../schema'
import { ICON_NODES } from './icon-paths'

/** Inline SVG icons (no client component, no JS) — render identically in previews, exports and screenshots. */
export function Icon({ name, size = 22 }: { name?: IconName; size?: number }) {
  const nodes = ICON_NODES[name ?? 'check'] ?? ICON_NODES.check!
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {nodes.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}
