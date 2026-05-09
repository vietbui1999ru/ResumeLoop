'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import ChatDiff from '@/components/ChatDiff'

const newId = () => crypto.randomUUID()

interface Session {
  session_id: string
  started_at: string
  first_message: string | null
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
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionId, setSessionId] = useState<string>(() => newId())
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(() => {
    fetch('/api/chat/sessions')
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

  const startNew = () => {
    setSessionId(newId())
    setMessages([])
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString()

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Session sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={startNew}
            className="w-full text-xs text-indigo-400 hover:text-indigo-300 text-left"
          >
            + New session
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.map(s => (
            <button
              key={s.session_id}
              onClick={() => {
                setSessionId(s.session_id)
                setMessages([])
              }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 ${
                s.session_id === sessionId ? 'bg-zinc-800' : ''
              }`}
            >
              <p className="text-zinc-300 truncate">{s.first_message ?? '(empty)'}</p>
              <p className="text-zinc-600">{fmtDate(s.started_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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

        {/* Input */}
        <div className="border-t border-zinc-800 px-4 py-3 flex gap-2">
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
      </div>
    </div>
  )
}
