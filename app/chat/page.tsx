'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import ChatDiff from '@/components/ChatDiff'
import GithubIngest from '@/components/GithubIngest'
import { TourBubble } from '@/components/TourBubble'
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
  const [sessions, setSessions] = useState<Session[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [tab, setTab] = useState<'chat' | 'import'>('chat')
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(() => {
    fetch('/api/sessions')
      .then(r => (r.ok ? r.json() : []))
      .then(setSessions)
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

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

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text }),
    })
    if (!res.body) {
      setMessages(prev => prev.filter(m => m.id !== assistantId))
      setStreaming(false)
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
            setMessages(prev =>
              prev.map(m => (m.id === assistantId ? { ...m, text: m.text + event.delta } : m))
            )
          } else if (event.type === 'diff') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, diff: { file: event.file, description: event.description, diff: event.diff } }
                  : m
              )
            )
          } else if (event.type === 'done') {
            setStreaming(false)
            loadSessions()
          } else if (event.type === 'error') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, text: m.text + `\n\nError: ${event.message}` } : m
              )
            )
            setStreaming(false)
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    setStreaming(false)
  }

  const loadSessionHistory = useCallback(async (sid: string) => {
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
  }, [])

  const startNew = async () => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Session ${new Date().toLocaleDateString()}` }),
    })
    if (!res.ok) return
    const created: Session = await res.json()
    setActiveSessionId(created.id)
    setMessages([])
    loadSessions()
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString()

  return (
    <div className="flex h-full">
      {/* Session sidebar — scrolls independently */}
      <div className="w-48 flex-shrink-0 border-r border-zinc-800 flex flex-col h-full">
        <div className="relative p-3 border-b border-zinc-800 flex-shrink-0">
          <button
            onClick={() => void startNew()}
            className="w-full text-xs text-indigo-400 hover:text-indigo-300 text-left"
          >
            + New session
          </button>
          <TourBubble
            tourKey="chat-sessions"
            title="Resume sessions"
            body="Each session holds its own resume variant. Create a new session before generating to keep edits isolated."
            position="right"
            width={240}
          />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => {
                setActiveSessionId(s.id)
                loadSessionHistory(s.id)
              }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 ${
                s.id === sessionId ? 'bg-zinc-800' : ''
              }`}
            >
              <p className="text-zinc-300 truncate">{s.name}</p>
              <p className="text-zinc-600">{fmtDate(s.created_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Tab bar — fixed */}
        <div className="flex border-b border-zinc-800 px-4 pt-3 gap-4 flex-shrink-0">
          <button
            onClick={() => setTab('chat')}
            className={`text-sm pb-2 border-b-2 ${tab === 'chat' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >Chat</button>
          <button
            onClick={() => setTab('import')}
            className={`text-sm pb-2 border-b-2 ${tab === 'import' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >Import from GitHub</button>
        </div>

        {tab === 'import' ? (
          <div className="flex-1 overflow-y-auto min-h-0">
            <GithubIngest />
          </div>
        ) : (
          <>
            {/* Messages — scrolls independently */}
            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-2xl ${m.role === 'user' ? 'bg-indigo-900/40 rounded-lg px-4 py-2' : ''}`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                    {m.diff && (
                      <ChatDiff
                        file={m.diff.file}
                        description={m.diff.description}
                        diff={m.diff.diff}
                        sessionId={sessionId}
                        onApplied={() => {}}
                      />
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input — fixed at bottom */}
            <div className="relative border-t border-zinc-800 px-4 py-3 flex gap-2 flex-shrink-0">
              <TourBubble
                tourKey="chat-input"
                title="Edit your resume with AI"
                body='Ask Claude to tailor your resume for a role — e.g. "Emphasize Go experience" or "Swap in the systems bullets for this JD." Changes appear as diffs you can accept or reject.'
                position="above"
                align="left"
                width={300}
              />
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                disabled={streaming}
                rows={2}
                placeholder="Ask Claude to update your profile…"
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
    </div>
  )
}
