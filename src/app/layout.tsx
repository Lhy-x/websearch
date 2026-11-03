import type { Metadata } from 'next'
import 'leaflet/dist/leaflet.css'
import './globals.css'
import { Providers } from '@/components/providers'

export const metadata: Metadata = {
  title: { default: 'ProspectForge', template: '%s · ProspectForge' },
  description: 'Prospection locale et génération de sites — outil privé',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
