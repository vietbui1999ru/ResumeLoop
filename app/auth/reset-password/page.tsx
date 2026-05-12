'use client'
import { useState, FormEvent, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function ResetForm() {
  const token  = useSearchParams().get('token') ?? ''
  const router = useRouter()
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== password2) { setError('Passwords do not match'); return }
    if (password.length < 8)    { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? 'Reset failed'); return }
      router.push('/auth/signin?reset=1')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-sm text-zinc-400">
        Invalid reset link.{' '}
        <Link href="/auth/forgot-password" className="text-indigo-400 hover:text-indigo-300">Request a new one</Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="password" className="text-xs text-zinc-500 block mb-1">New password</label>
        <input
          id="password" type="password" required autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)}
          className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
          placeholder="At least 8 characters"
        />
      </div>
      <div>
        <label htmlFor="password2" className="text-xs text-zinc-500 block mb-1">Confirm password</label>
        <input
          id="password2" type="password" required autoComplete="new-password"
          value={password2} onChange={e => setPassword2(e.target.value)}
          className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
          placeholder="••••••••"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit" disabled={loading}
        className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
      >
        {loading ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-100">Set new password</h1>
        </div>
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  )
}
