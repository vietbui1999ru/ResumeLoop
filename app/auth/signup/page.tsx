'use client'
import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignUpPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Sign up failed')
      setLoading(false)
      return
    }

    const result = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (result?.error) {
      setError('Account created but sign-in failed — please sign in manually')
      return
    }
    router.push('/')
    router.refresh()
  }

  const tryDemo = async () => {
    setDemoLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' })
      if (!res.ok) { setError('Demo unavailable — try again'); setDemoLoading(false); return }
      const { email: demoEmail, password: demoPassword } = await res.json() as { email: string; password: string }
      const result = await signIn('credentials', { email: demoEmail, password: demoPassword, redirect: false })
      if (result?.error) { setError('Demo sign-in failed'); setDemoLoading(false); return }
      router.push('/')
      router.refresh()
    } catch {
      setError('Demo unavailable — try again')
      setDemoLoading(false)
    }
  }

  const anyLoading = loading || demoLoading

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-100">Create account</h1>
          <p className="text-sm text-zinc-500 mt-1">ResumeAnalyze</p>
        </div>

        {/* Try Demo */}
        <button
          onClick={tryDemo}
          disabled={anyLoading}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-950 hover:bg-indigo-900 disabled:opacity-40 rounded text-sm font-medium text-indigo-300 transition-colors border border-indigo-700 mb-6"
        >
          {demoLoading ? 'Loading demo…' : '✦ Try Demo — no account needed'}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-xs text-zinc-400">or create account</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-xs text-zinc-500 block mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-xs text-zinc-500 block mb-1">
              Password <span className="text-zinc-400">(min 8 characters)</span>
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={anyLoading}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-xs text-zinc-500 mt-6 text-center">
          Already have an account?{' '}
          <Link href="/auth/signin" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
