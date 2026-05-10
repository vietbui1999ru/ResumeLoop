'use client'
import { useEffect, useState } from 'react'

interface Props {
  url: string
}

export default function PdfViewer({ url }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    setBlobUrl(null)
    setError(null)

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then(buf => {
        const blob = new Blob([buf], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      })
      .catch(e => {
        console.error('[PdfViewer] fetch error:', e.message)
        setError(e.message)
      })

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  if (error) return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
      <p className="text-red-400 text-sm px-4 text-center">Failed to load PDF: {error}</p>
    </div>
  )

  if (!blobUrl) return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
      <p className="text-zinc-400 text-sm">Loading PDF…</p>
    </div>
  )

  return (
    <embed
      src={blobUrl}
      type="application/pdf"
      className="absolute inset-0 w-full h-full"
    />
  )
}
