import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ResumeAnalyze',
  description: 'Resume pipeline dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 h-screen overflow-hidden flex`}>
        <Providers>
          <Sidebar />
          <main className="flex-1 min-h-0 overflow-auto">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
