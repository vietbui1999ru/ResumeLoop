'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export default function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width - 32))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setError(null)
  }, [])

  const handleLoadError = useCallback((err: Error) => setError(err.message), [])

  if (error) return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
      <p className="text-red-400 text-sm px-4 text-center">Failed to load PDF: {error}</p>
    </div>
  )

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-auto bg-zinc-800 flex flex-col items-center py-4 gap-4">
      <Document
        file={url}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={handleLoadError}
        loading={<p className="text-zinc-400 text-sm mt-8">Loading PDF…</p>}
        error={<p className="text-red-400 text-sm mt-8 px-4 text-center">Failed to load PDF</p>}
      >
        {numPages && Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i + 1}
            pageNumber={i + 1}
            width={containerWidth ?? undefined}
            className="shadow-lg"
          />
        ))}
      </Document>
    </div>
  )
}
