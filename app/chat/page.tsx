'use client'
import { useState, useRef, useEffect } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: next }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let reply = ''
    setMessages(p => [...p, { role: 'assistant', content: '' }])
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      reply += dec.decode(value)
      setMessages(p => [...p.slice(0, -1), { role: 'assistant', content: reply }])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <h1 className="text-xl font-semibold mb-2">Chat</h1>
      <p className="text-xs text-zinc-600 mb-4">
        <code>/jobs [track]</code> · <code>/stats</code> · <code>/resume [job_id]</code> · <code>/scan</code>
      </p>
      <div className="flex-1 overflow-auto space-y-3 mb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-2xl rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-100'
            }`}>
              {m.content || <span className="text-zinc-500">…</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask about your pipeline or type /stats…"
          disabled={loading}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm"
        >
          Send
        </button>
      </div>
    </div>
  )
}
