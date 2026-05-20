'use client'
import Giscus from '@giscus/react'
import { useEffect, useState } from 'react'

type GiscusState = 'loading' | 'ready' | 'error'

export function GiscusWidget() {
  const [state, setState] = useState<GiscusState>('loading')

  useEffect(() => {
    // Giscus sends a postMessage from giscus.app when the iframe is ready or errored.
    // Without this listener there is no way to know if it loaded.
    const timeoutId = setTimeout(() => {
      setState(prev => (prev === 'loading' ? 'error' : prev))
    }, 12_000)

    function onMessage(ev: MessageEvent) {
      if (ev.origin !== 'https://giscus.app') return
      const msg = ev.data as { giscus?: { error?: string } } | undefined
      if (!msg?.giscus) return
      setState(msg.giscus.error ? 'error' : 'ready')
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timeoutId)
    }
  }, [])

  if (state === 'error') {
    return (
      <div data-testid="giscus-widget" className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-6 space-y-3">
        <p className="text-sm text-zinc-400">
          Comments failed to load. GitHub Discussions may not be configured yet, or your
          network is blocking external scripts.
        </p>
        <a
          href="https://github.com/vietbui1999ru/ResumeLoop/discussions"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Open GitHub Discussions →
        </a>
      </div>
    )
  }

  return (
    <div data-testid="giscus-widget" className="min-h-[300px]">
      {state === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-zinc-500 py-6">
          <span className="w-4 h-4 border-2 border-zinc-700 border-t-indigo-400 rounded-full animate-spin shrink-0" />
          Loading comments…
        </div>
      )}
      <Giscus
        repo="vietbui1999ru/ResumeLoop"
        repoId="R_kgDORgSzSw"
        category="General"
        categoryId="DIC_kwDORgSzS84C9fnt"
        mapping="pathname"
        strict="0"
        reactionsEnabled="1"
        emitMetadata="0"
        inputPosition="bottom"
        theme="preferred_color_scheme"
        lang="en"
      />
    </div>
  )
}
