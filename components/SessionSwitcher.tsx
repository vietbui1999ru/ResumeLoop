'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/contexts/SessionContext'

interface Session {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export default function SessionSwitcher() {
  const { activeSessionId, setActiveSessionId } = useSession()
  const [sessions, setSessions] = useState<Session[]>([])
  const [open, setOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const fetchSessions = () => {
    fetch('/api/sessions')
      .then(r => r.ok ? r.json() as Promise<Session[]> : Promise.resolve([]))
      .then(setSessions)
      .catch(() => {})
  }

  useEffect(() => { fetchSessions() }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeName = sessions.find(s => s.id === activeSessionId)?.name ?? activeSessionId

  const submitNew = async () => {
    const name = newName.trim()
    if (!name) return
    setIsCreating(false)
    setNewName('')
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return
      const created = await res.json() as Session
      setActiveSessionId(created.id)
      fetchSessions()
      setOpen(false)
    } catch { /* ignore */ }
  }

  const promote = async (id: string) => {
    try {
      await fetch(`/api/sessions/${id}/promote`, { method: 'POST' })
      setActiveSessionId('default')
      fetchSessions()
      setOpen(false)
    } catch { /* ignore */ }
  }

  const del = async (id: string) => {
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (activeSessionId === id) setActiveSessionId('default')
      fetchSessions()
      setOpen(false)
    } catch { /* ignore */ }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded flex items-center gap-1.5"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
        <span className="max-w-32 truncate text-zinc-200">{activeName}</span>
        <span className="text-zinc-500">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 group ${
                s.id === activeSessionId ? 'bg-zinc-800' : ''
              }`}
            >
              {s.id === activeSessionId && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
              )}
              {s.id !== activeSessionId && <span className="w-1.5 shrink-0" />}
              <button
                onClick={() => { setActiveSessionId(s.id); setOpen(false) }}
                className="flex-1 text-left text-sm text-zinc-200 truncate"
              >
                {s.name}
              </button>
              {s.id !== 'default' && (
                <span className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={() => void promote(s.id)}
                    className="text-xs text-zinc-400 hover:text-indigo-300 px-1"
                    title="Promote to master"
                  >↑</button>
                  <button
                    onClick={() => void del(s.id)}
                    className="text-xs text-zinc-400 hover:text-red-400 px-1"
                    title="Delete"
                  >✕</button>
                </span>
              )}
            </div>
          ))}
          <div className="border-t border-zinc-800 mt-1 pt-1">
            {isCreating ? (
              <div className="px-3 py-1.5 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void submitNew()
                    if (e.key === 'Escape') { setIsCreating(false); setNewName('') }
                  }}
                  placeholder={`Session ${new Date().toLocaleDateString()}`}
                  className="flex-1 text-sm bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
                <button onClick={() => void submitNew()} className="text-xs text-indigo-400 hover:text-indigo-300 px-1">✓</button>
                <button onClick={() => { setIsCreating(false); setNewName('') }} className="text-xs text-zinc-400 hover:text-zinc-200 px-1">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full text-left px-3 py-1.5 text-sm text-indigo-400 hover:bg-zinc-800 hover:text-indigo-300"
              >
                + New branch…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
