'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function VerifyContent() {
  const token = useSearchParams().get('token') ?? ''
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    const ac = new AbortController()
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { signal: ac.signal })
      .then(r => { if (!ac.signal.aborted) setStatus(r.ok ? 'ok' : 'error') })
      .catch(e => { if ((e as DOMException)?.name !== 'AbortError') setStatus('error') })
    return () => ac.abort()
  }, [token])

  if (status === 'loading') return <p className="text-sm text-zinc-400">Verifying…</p>

  if (status === 'ok') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-200">Email verified! You can now sign in.</p>
        <Link href="/auth/signin" className="text-sm text-indigo-400 hover:text-indigo-300">Sign in</Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-red-400">Invalid or expired verification link.</p>
      <Link href="/auth/signin" className="text-sm text-indigo-400 hover:text-indigo-300">Back to sign in</Link>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-100">Verify email</h1>
        </div>
        <Suspense>
          <VerifyContent />
        </Suspense>
      </div>
    </div>
  )
}
