import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { buildFontInitScript } from '@/lib/font-size'

// display: 'swap' is set explicitly so Next.js emits a matching preload hint.
// Without it, Next.js 14 preloads a size-adjusted fallback variant (.s.p.woff2)
// that the browser never uses because the actual font is loaded differently,
// producing "preloaded with link preload was not used within a few seconds".
const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'ResumeLoop',
  description: 'Resume pipeline dashboard',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Blocking inline script — runs before paint, prevents font-size FOUC on reload */}
        <script dangerouslySetInnerHTML={{ __html: buildFontInitScript() }} />
      </head>
      <body suppressHydrationWarning className={`${inter.className} bg-surface-base text-text-primary`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
