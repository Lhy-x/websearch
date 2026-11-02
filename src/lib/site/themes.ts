import type { SiteStyle, SiteTheme } from './schema'

export const FONT_PAIRS: { heading: string; body: string; mood: string }[] = [
  { heading: 'Playfair Display', body: 'Inter', mood: 'elegant' },
  { heading: 'Cormorant Garamond', body: 'Lato', mood: 'haut_de_gamme' },
  { heading: 'Fraunces', body: 'Work Sans', mood: 'artisanal' },
  { heading: 'Oswald', body: 'Inter', mood: 'bold' },
  { heading: 'Bebas Neue', body: 'Roboto', mood: 'bold' },
  { heading: 'DM Serif Display', body: 'DM Sans', mood: 'editorial' },
  { heading: 'Space Grotesk', body: 'Inter', mood: 'moderne' },
  { heading: 'Manrope', body: 'Manrope', mood: 'minimaliste' },
  { heading: 'Sora', body: 'Inter', mood: 'creatif' },
  { heading: 'Libre Baskerville', body: 'Source Sans 3', mood: 'institutionnel' },
  { heading: 'Archivo', body: 'Archivo', mood: 'trade' },
  { heading: 'Josefin Sans', body: 'Nunito Sans', mood: 'premium' },
]
export const ALLOWED_FONTS = new Set(FONT_PAIRS.flatMap((p) => [p.heading, p.body]))

/** Style presets adjust a template's base theme without breaking its identity. */
export function applyStyle(base: SiteTheme, style: SiteStyle): SiteTheme {
  const t = { ...base }
  switch (style) {
    case 'minimaliste':
      return { ...t, radius: 'none', density: 'airy', buttonStyle: 'outline', headingFont: 'Manrope', bodyFont: 'Manrope', headingCase: 'normal' }
    case 'premium':
      return { ...t, radius: 'sm', density: 'airy', buttonStyle: 'solid', headingFont: 'Josefin Sans', bodyFont: 'Nunito Sans' }
    case 'editorial':
      return { ...t, radius: 'none', density: 'comfortable', headingFont: 'DM Serif Display', bodyFont: 'DM Sans' }
    case 'institutionnel':
      return { ...t, radius: 'sm', density: 'comfortable', buttonStyle: 'solid', headingFont: 'Libre Baskerville', bodyFont: 'Source Sans 3', headingCase: 'normal' }
    case 'creatif':
      return { ...t, radius: 'lg', buttonStyle: 'pill', headingFont: 'Sora', bodyFont: 'Inter' }
    case 'artisanal':
      return { ...t, radius: 'md', headingFont: 'Fraunces', bodyFont: 'Work Sans' }
    case 'elegant':
      return { ...t, radius: 'sm', density: 'airy', headingFont: 'Playfair Display', bodyFont: 'Inter' }
    case 'haut_de_gamme':
      return { ...t, radius: 'none', density: 'airy', buttonStyle: 'outline', headingFont: 'Cormorant Garamond', bodyFont: 'Lato' }
    case 'moderne':
    default:
      return t
  }
}

export function googleFontsHref(theme: Pick<SiteTheme, 'headingFont' | 'bodyFont'>): string {
  const fams = [...new Set([theme.headingFont, theme.bodyFont])].filter((f) => ALLOWED_FONTS.has(f))
  const q = fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&')
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}

/** WCAG relative luminance contrast ratio — used to keep AI-picked colours readable. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
