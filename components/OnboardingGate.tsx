'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname.startsWith('/onboarding') || pathname.startsWith('/auth')) return

    fetch('/api/profiles')
      .then(r => r.json())
      .then((data: { profiles?: Array<{ id: string }> }) => {
        if (!data.profiles || data.profiles.length === 0) {
          router.replace('/onboarding')
        }
      })
      .catch(() => { /* silently ignore — don't block the app on fetch failure */ })
  }, [pathname, router])

  return <>{children}</>
}
