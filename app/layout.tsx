import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { TourOverlay } from '@/components/TourOverlay'
import { PageTransition } from '@/components/PageTransition'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ResumeAnalyze',
  description: 'Resume pipeline dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-surface-base text-text-primary h-screen overflow-hidden flex`}>
        <Providers>
          <Sidebar />
          <TourOverlay />
          <PageTransition>{children}</PageTransition>
        </Providers>
      </body>
    </html>
  )
}
