'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m`
  const s = Math.floor((ms % 60_000) / 1_000)
  return `${m}m ${s}s`
}

export function DemoBanner({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(expiresAt - Date.now())

  useEffect(() => {
    const tick = () => setRemaining(expiresAt - Date.now())
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [expiresAt])

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-indigo-950 border-b border-indigo-800 text-xs text-indigo-300 shrink-0">
      <span>
        Demo session — data deleted in{' '}
        <span className="font-semibold text-indigo-200">{formatRemaining(remaining)}</span>
      </span>
      <span className="text-indigo-600">·</span>
      <Link href="/auth/signup" className="text-indigo-400 hover:text-indigo-200 underline underline-offset-2 transition-colors">
        Sign up to save your work
      </Link>
    </div>
  )
}
