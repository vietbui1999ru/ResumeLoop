'use client'
import { useState, FormEvent } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email,     setEmail]     = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.status === 429) { setError('Too many requests. Try again later.'); return }
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-100">Reset password</h1>
          <p className="text-sm text-zinc-500 mt-1">We&apos;ll send a reset link to your email.</p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              If that email is registered, you&apos;ll receive a reset link shortly.
            </p>
            <Link href="/auth/signin" className="text-xs text-indigo-400 hover:text-indigo-300">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="text-xs text-zinc-500 block mb-1">Email</label>
              <input
                id="email" type="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                placeholder="you@example.com"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <p className="text-xs text-zinc-500 text-center">
              <Link href="/auth/signin" className="text-indigo-400 hover:text-indigo-300">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
