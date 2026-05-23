'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import ChatDiff from '@/components/ChatDiff'
import GithubIngest from '@/components/GithubIngest'
import { BulletsPreview } from '@/components/BulletsPreview'
import { useSession } from '@/contexts/SessionContext'

const newId = () => crypto.randomUUID()

interface Session {
  id: string
  name: string
  created_at: string
}

type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'diff'; file: string; description: string; diff: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  diff?: { file: string; description: string; diff: string }
}

export default function ChatPage() {
  const { activeSessionId: sessionId, setActiveSessionId } = useSession()
  const searchParams = useSearchParams()
  const [sessions, setSessions] = useState<Session[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [tab, setTab] = useState<'chat' | 'import'>('chat')
  const [profileJson, setProfileJson] = useState('')
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>(undefined)
  const [bulletsOpen, setBulletsOpen] = useState(true)
  const [grillMode, setGrillMode] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const streamAbortRef = useRef<AbortController | null>(null)

  const loadProfile = useCallback(async () => {
    try {
      const listRes = await fetch('/api/profiles')
      if (!listRes.ok) return
      const { profiles } = await listRes.json() as { profiles: { id: string; is_active: number }[] }
      const active = profiles.find(p => p.is_active === 1) ?? profiles[0] ?? null
      if (!active) return
      setActiveProfileId(active.id)
      const dataRes = await fetch(`/api/profiles/${active.id}`)
      if (!dataRes.ok) return
      const { data } = await dataRes.json() as { data: string }
      setProfileJson(data ?? '')
    } catch { /* ignore */ }
  }, [])

  const loadSessions = useCallback(() => {
    const ac = new AbortController()
    fetch('/api/sessions', { signal: ac.signal })
      .then(r => r.ok ? r.json() as Promise<Session[]> : Promise.resolve([]))
      .then(setSessions)
      .catch(() => {})
    return () => ac.abort()
  }, [])

  useEffect(() => {
    return loadSessions()
  }, [loadSessions])

  useEffect(() => {
    void loadProfile()
    setHydrated(true)
  }, [loadProfile])

  useEffect(() => {
    if (!hydrated) return
    if (searchParams.get('grill') === '1') {
      setGrillMode(true)
    } else if (sessions.length === 0) {
      setGrillMode(true)
    }
  }, [sessions, searchParams, hydrated])

  useEffect(() => {
    return () => { streamAbortRef.current?.abort() }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')

    const userMsg: Message = { id: newId(), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true)

    const assistantId = newId()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }])

    const ac = new AbortController()
    streamAbortRef.current = ac

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, is_first_session: grillMode }),
        signal: ac.signal,
      })
      if (!res.body) {
        setMessages(prev => prev.filter(m => m.id !== assistantId))
        return
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          try {
            const event: ChatEvent = JSON.parse(part.slice(6))
            if (event.type === 'text') {
              setMessages(prev => {
                const updated = prev.map(m => (m.id === assistantId ? { ...m, text: m.text + event.delta } : m))
                // Check if message contains grill complete JSON
                const assistantMsg = updated.find(m => m.id === assistantId)
                if (assistantMsg && assistantMsg.text.includes('{"grill_complete": true}')) {
                  setGrillMode(false)
                }
                return updated
              })
            } else if (event.type === 'diff') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, diff: { file: event.file, description: event.description, diff: event.diff } }
                    : m
                )
              )
            } else if (event.type === 'done') {
              loadSessions()
            } else if (event.type === 'error') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, text: m.text + `\n\nError: ${event.message}` } : m
                )
              )
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, text: m.text + '\n\nConnection lost.' } : m)
        )
      }
    } finally {
      if (!ac.signal.aborted) setStreaming(false)
    }
  }

  const loadSessionHistory = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${sid}`)
      if (!res.ok) return
      const rows = await res.json() as Array<{ role: string; content: string | null; tool_calls: string | null }>
      const msgs: Message[] = rows
        .filter(r => r.role === 'user' || r.role === 'assistant')
        .map(r => ({
          id: crypto.randomUUID(),
          role: r.role as 'user' | 'assistant',
          text: r.content ?? '',
        }))
      setMessages(msgs)
    } catch { /* ignore */ }
  }, [])

  const startNew = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Session ${new Date().toLocaleDateString()}` }),
      })
      if (!res.ok) return
      const created = await res.json() as Session
      setActiveSessionId(created.id)
      setMessages([])
      loadSessions()
    } catch { /* ignore */ }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString()

  return (
    <div className="flex h-full">
      {/* Session sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-zinc-800 flex flex-col h-full">
        <div className="p-3 border-b border-zinc-800 flex-shrink-0">
          <button
            onClick={() => void startNew()}
            className="w-full text-xs text-indigo-400 hover:text-indigo-300 text-left"
          >
            + New session
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => { setActiveSessionId(s.id); loadSessionHistory(s.id) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 ${s.id === sessionId ? 'bg-zinc-800' : ''}`}
            >
              <p className="text-zinc-300 truncate">{s.name}</p>
              <p className="text-zinc-400">{fmtDate(s.created_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat column */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Tab bar */}
        <div className="flex items-center border-b border-zinc-800 px-4 pt-3 gap-4 flex-shrink-0">
          <button
            onClick={() => setTab('chat')}
            className={`text-sm pb-2 border-b-2 ${tab === 'chat' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >Chat</button>
          <button
            data-tour="chat-github-import"
            onClick={() => setTab('import')}
            className={`text-sm pb-2 border-b-2 ${tab === 'import' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >Import from GitHub</button>
          <button
            data-tour="chat-bullets-toggle"
            onClick={() => setBulletsOpen(v => !v)}
            className={`ml-auto mb-2 text-xs px-2 py-1 rounded border transition-colors ${
              bulletsOpen
                ? 'border-indigo-700/60 text-indigo-400 bg-indigo-900/20'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
            title="Toggle bullets preview"
          >
            {bulletsOpen ? 'Bullets ×' : 'Bullets ↗'}
          </button>
        </div>

        {tab === 'import' ? (
          <div className="flex-1 overflow-y-auto min-h-0">
            <GithubIngest />
          </div>
        ) : (
          <>
            {grillMode && (
              <div className="flex items-center gap-3 px-6 py-3 bg-indigo-950/60 border-b border-indigo-800/40 flex-shrink-0">
                <span className="text-sm text-indigo-300 font-medium">Getting to know your work history</span>
                <button
                  onClick={() => setGrillMode(false)}
                  className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Skip →
                </button>
              </div>
            )}

            {grillMode && messages.length === 0 && (
              <div className="px-6 py-3 border-b border-zinc-800 flex-shrink-0">
                <button
                  onClick={() => setTab('import')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline transition-colors"
                >
                  Import from GitHub first →
                </button>
                <span className="text-xs text-zinc-500 ml-2">then we&apos;ll ask about your work</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-2xl ${m.role === 'user' ? 'bg-indigo-900/40 rounded-lg px-4 py-2' : ''}`}>
                    <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                    {m.diff && (
                      <ChatDiff
                        file={m.diff.file}
                        description={m.diff.description}
                        diff={m.diff.diff}
                        sessionId={sessionId}
                        onApplied={(accepted) => { if (accepted) void loadProfile() }}
                      />
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-zinc-800 px-4 py-3 flex gap-2 flex-shrink-0">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                disabled={streaming}
                rows={2}
                placeholder="Ask Claude to update your bullets…"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                onClick={send}
                disabled={streaming || !input.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>

      {/* Bullets panel — collapsible */}
      {bulletsOpen && (
        <div className="w-[35%] min-w-64 flex-shrink-0 border-l border-zinc-800 flex flex-col h-full bg-zinc-950">
          <div className="px-3 py-1.5 bg-zinc-800/80 border-b border-zinc-700 flex items-center gap-2 flex-shrink-0">
            <span className="text-2xs text-zinc-500 uppercase tracking-widest font-mono">Bullets</span>
            <span className="ml-auto text-2xs text-zinc-400 font-mono">live</span>
          </div>
          <BulletsPreview json={profileJson} profileId={activeProfileId} onSaved={() => void loadProfile()} />
        </div>
      )}
    </div>
  )
}
