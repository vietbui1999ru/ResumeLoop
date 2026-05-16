import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { TourOverlay } from '@/components/TourOverlay'
import { PageTransition } from '@/components/PageTransition'
import { Providers } from './providers'
import { buildFontInitScript } from '@/lib/font-size'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ResumeLoop',
  description: 'Resume pipeline dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Blocking inline script — runs before paint, prevents font-size FOUC on reload */}
        <script dangerouslySetInnerHTML={{ __html: buildFontInitScript() }} />
      </head>
      <body suppressHydrationWarning className={`${inter.className} bg-surface-base text-text-primary h-screen overflow-hidden flex`}>
        <Providers>
          <Sidebar />
          <TourOverlay />
          <PageTransition>{children}</PageTransition>
        </Providers>
      </body>
    </html>
  )
}
