'use client'
import { useState, useEffect, useCallback } from 'react'
import { storeHandle, loadHandle, checkPermission, requestPermission } from '@/lib/cloud-fs'

interface Props {
  handleKey: string  // e.g. 'jobs-folder', 'output-folder', 'outreach-folder'
  label: string
  hint: string
  onSelect: (folderName: string | null) => void
}

// File System Access API is Chromium-only — Firefox and Safari don't support it.
function isFsaSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export function CloudFolderPicker({ handleKey, label, hint, onSelect }: Props) {
  const [folderName, setFolderName] = useState<string | null>(null)
  const [perm, setPerm]             = useState<'granted' | 'prompt' | 'denied' | null>(null)
  const [loading, setLoading]       = useState(true)
  const [supported]                 = useState(() => isFsaSupported())

  useEffect(() => {
    if (!supported) { setLoading(false); return }
    loadHandle(handleKey)
      .then(async handle => {
        if (!handle) { setLoading(false); return }
        setFolderName(handle.name)
        const state = await checkPermission(handle)
        setPerm(state)
        if (state === 'granted') onSelect(handle.name)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleKey, supported]) // intentionally omit onSelect — stable callback

  const selectFolder = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showDirectoryPicker({ id: handleKey, mode: 'read' }) as FileSystemDirectoryHandle
      await storeHandle(handleKey, handle)
      setFolderName(handle.name)
      setPerm('granted')
      onSelect(handle.name)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error('[CloudFolderPicker] picker error', e)
    }
  }, [handleKey, onSelect])

  const reGrant = useCallback(async () => {
    const handle = await loadHandle(handleKey)
    if (!handle) { selectFolder(); return }
    const ok = await requestPermission(handle)
    setPerm(ok ? 'granted' : 'denied')
    if (ok) onSelect(handle.name)
  }, [handleKey, onSelect, selectFolder])

  if (loading) return null

  if (!supported) {
    return (
      <div className="bg-zinc-900 border border-amber-700/50 rounded-lg p-4 space-y-2">
        <div>
          <p className="text-sm font-medium text-zinc-200">{label}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>
        </div>
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-700/40 rounded px-3 py-2">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>
            Local folder access requires Chrome or Edge — this browser does not support the File System Access API.
            To import jobs, switch to Chrome/Edge or use the cloud upload option.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>
      </div>

      <div className="flex gap-2 items-center">
        <code className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-300 truncate">
          {folderName ?? 'No folder selected'}
        </code>
        {perm === 'prompt' && (
          <button onClick={reGrant} className="text-xs px-3 py-2 bg-amber-700 hover:bg-amber-600 rounded">
            Re-grant
          </button>
        )}
        <button onClick={selectFolder} className="text-xs px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded">
          {folderName ? 'Change' : 'Select folder'}
        </button>
      </div>

      {perm === 'denied' && (
        <p className="text-xs text-red-400">Access denied — click Select folder and grant permission again.</p>
      )}
      {folderName && perm === 'granted' && (
        <p className="text-xs text-green-500">&#x2713; Access granted to <span className="font-mono">{folderName}</span></p>
      )}
    </div>
  )
}
