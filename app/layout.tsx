import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { TourOverlay } from '@/components/TourOverlay'
import { PageTransition } from '@/components/PageTransition'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ResumeLoop',
  description: 'Resume pipeline dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      {/* Applies saved font-size class before first paint — no flash of default size */}
      <Script id="font-size-init" strategy="beforeInteractive">{`
        try{var f=localStorage.getItem('rl-font-size');if(f==='small'||f==='medium'||f==='large')document.documentElement.classList.add('font-'+f)}catch(e){}
      `}</Script>
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
