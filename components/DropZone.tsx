'use client'
import { useRef, useState } from 'react'

interface DropZoneProps {
  onDrop: (files: FileList) => void
  onClickUpload: () => void
}

export function DropZone({ onDrop, onClickUpload }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  // Counter prevents false dragleave fires when cursor moves over child elements
  const dragCounter = useRef(0)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragOver(false)
  }
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) onDrop(e.dataTransfer.files)
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={onClickUpload}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClickUpload()}
      aria-label="Drop .md files here or click to upload"
      className={`
        flex-1 flex items-center justify-center p-12 cursor-pointer select-none
        transition-colors duration-150
        ${isDragOver ? 'bg-indigo-950/20' : ''}
      `}
    >
      <div className={`
        text-center space-y-4 max-w-sm rounded-xl border-2 border-dashed px-8 py-10
        transition-colors duration-150
        ${isDragOver
          ? 'border-indigo-500 bg-indigo-950/30'
          : 'border-border-default hover:border-border-strong'
        }
      `}>
        <div className={`
          inline-flex items-center justify-center w-10 h-10 rounded-xl text-xl
          transition-colors duration-150
          ${isDragOver
            ? 'bg-indigo-600/30 border border-indigo-500/50'
            : 'bg-indigo-600/20 border border-indigo-600/30'
          }
        `}>
          {isDragOver ? '⬇' : '📋'}
        </div>
        <div className="space-y-1">
          <p className="text-text-secondary text-sm font-medium">
            {isDragOver ? 'Drop to import' : 'No jobs yet'}
          </p>
          <p className="text-text-muted text-xs leading-relaxed">
            {isDragOver
              ? 'Release to upload .md files'
              : 'Drag & drop .md files here, or click to select. In Chrome/Edge, connect a Jobs folder in Settings to scan automatically.'
            }
          </p>
        </div>
      </div>
    </div>
  )
}
