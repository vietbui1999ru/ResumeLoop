'use client'
import { useState, FormEvent } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function AccountPage() {
  const { data: session } = useSession()
  const router = useRouter()

  // Password change form
  const [current,   setCurrent]   = useState('')
  const [newPwd,    setNewPwd]    = useState('')
  const [newPwd2,   setNewPwd2]   = useState('')
  const [pwError,   setPwError]   = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  // Delete account form
  const [delConfirm,  setDelConfirm]  = useState('')
  const [delError,    setDelError]    = useState('')
  const [delLoading,  setDelLoading]  = useState(false)

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')
    if (newPwd !== newPwd2) { setPwError('New passwords do not match'); return }
    if (newPwd.length < 8)  { setPwError('Password must be at least 8 characters'); return }
    setPwLoading(true)
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setPwError(data.error ?? 'Failed'); return }
      setPwSuccess('Password updated.')
      setCurrent(''); setNewPwd(''); setNewPwd2('')
    } finally {
      setPwLoading(false)
    }
  }

  const deleteAccount = async () => {
    if (delConfirm.toLowerCase() !== 'delete') {
      setDelError('Type "delete" to confirm')
      return
    }
    setDelLoading(true)
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setDelError(data.error ?? 'Failed'); return }
      await signOut({ redirect: false })
      router.push('/auth/signin')
    } finally {
      setDelLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-12">
      <h1 className="text-lg font-semibold text-zinc-100">Account</h1>

      {/* Profile info */}
      <section className="space-y-2">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Profile</h2>
        <p className="text-sm text-zinc-300">{session?.user.email}</p>
        {session?.user.isDemo && (
          <p className="text-xs text-amber-500">Demo account — data resets periodically</p>
        )}
      </section>

      {/* Change password */}
      {!session?.user.isDemo && (
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">Change password</h2>
          <form onSubmit={changePassword} className="space-y-3 max-w-sm">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Current password</label>
              <input
                type="password" required value={current} onChange={e => setCurrent(e.target.value)}
                className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">New password</label>
              <input
                type="password" required value={newPwd} onChange={e => setNewPwd(e.target.value)}
                className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Confirm new password</label>
              <input
                type="password" required value={newPwd2} onChange={e => setNewPwd2(e.target.value)}
                className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            {pwError   && <p className="text-xs text-red-400">{pwError}</p>}
            {pwSuccess && <p className="text-xs text-green-400">{pwSuccess}</p>}
            <button
              type="submit" disabled={pwLoading}
              className="py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
            >
              {pwLoading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </section>
      )}

      {/* Danger zone */}
      {!session?.user.isDemo && (
        <section>
          <h2 className="text-xs font-medium text-red-500 uppercase tracking-wider mb-4">Danger zone</h2>
          <div className="border border-red-900/40 rounded p-4 space-y-3 max-w-sm bg-red-950/10">
            <p className="text-sm text-zinc-300">Delete account</p>
            <p className="text-xs text-zinc-500">This permanently deletes your account and all data. Type <code className="text-zinc-400">delete</code> to confirm.</p>
            <input
              type="text" value={delConfirm} onChange={e => setDelConfirm(e.target.value)}
              placeholder="delete"
              className="w-full text-sm bg-zinc-900 border border-red-900/50 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-red-600"
            />
            {delError && <p className="text-xs text-red-400">{delError}</p>}
            <button
              onClick={deleteAccount} disabled={delLoading}
              className="py-2 px-4 bg-red-800 hover:bg-red-700 disabled:opacity-40 rounded text-sm font-medium transition-colors text-white"
            >
              {delLoading ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
