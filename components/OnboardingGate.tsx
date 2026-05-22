'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const NEEDS_PROFILE = ['/', '/chat']
  const skip = !NEEDS_PROFILE.some(p => pathname === p || pathname.startsWith(p + '/'))
            || pathname.startsWith('/onboarding')
            || pathname.startsWith('/auth')
  const [checking, setChecking] = useState(!skip)

  useEffect(() => {
    if (skip) { setChecking(false); return }

    fetch('/api/profiles')
      .then(r => {
        if (r.status === 401) { router.replace('/auth/signin'); return null }
        if (!r.ok) return null
        return r.json() as Promise<{ profiles?: Array<{ id: string }> }>
      })
      .then(data => {
        if (data && (!data.profiles || data.profiles.length === 0)) {
          router.replace('/onboarding')
        }
      })
      .catch(() => { /* fetch failure — don't block the app */ })
      .finally(() => setChecking(false))
  }, [pathname, router, skip])

  if (checking) return null

  return <>{children}</>
}
