'use client'
import { AnimatedCheckbox } from '@/components/AnimatedCheckbox'
import { ACTION_COLORS, clipColor, fmtDate, FitBadge } from '@/lib/job-display'
import { VALID_ACTIONS } from '@/lib/actions'

interface Job {
  id:           string
  company:      string
  role_title:   string
  role_track:   string
  fit_pct:      number
  visa_status:  string
  tags:         string
  action:       string | null
  file_mtime:   string | null
  clipped_at:   string | null
  has_reasoning: number
  has_output:    number
  hidden:        number
}

interface JobCardProps {
  job: Job
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onActionChange: (action: string) => void
  genStatus?: string
}

export function JobCard({ job, selected, onSelect, onOpen, onActionChange, genStatus }: JobCardProps) {
  const clippedIso = job.clipped_at ?? job.file_mtime

  return (
    <div
      className={`bg-surface-card border rounded-lg p-4 cursor-pointer
                  transition-colors duration-100 active:bg-surface-raised
                  ${selected ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-800'}
                  ${job.hidden ? 'opacity-40' : ''}`}
      onClick={onOpen}
    >
      {/* Row 1: checkbox + company + fit badge */}
      <div className="flex items-start gap-3 mb-1.5">
        <div
          className="w-8 h-8 flex items-center justify-center shrink-0 -ml-1"
          onClick={e => { e.stopPropagation(); onSelect() }}
        >
          <AnimatedCheckbox
            checked={selected}
            onChange={onSelect}
            label={`Select ${job.company}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {job.visa_status === 'kill' && (
              <span className="text-red-500 text-2xs" title="No sponsorship">⊘</span>
            )}
            <span className="text-sm font-medium text-zinc-200">{job.company}</span>
            <FitBadge pct={job.fit_pct} />
          </div>
          {/* Row 2: role + track badge */}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-zinc-400 truncate">{job.role_title}</span>
            {job.role_track && (
              <span className="text-2xs px-1.5 py-0.5 bg-zinc-800 border border-zinc-700/80
                               text-zinc-500 rounded font-mono leading-none shrink-0">
                {job.role_track}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: action dropdown + date + resume status */}
      <div
        className="flex items-center gap-3 ml-7 mt-1"
        onClick={e => e.stopPropagation()}
      >
        <select
          value={job.action ?? '0-Saved'}
          onChange={e => onActionChange(e.target.value)}
          className={`h-9 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs
                      ${ACTION_COLORS[job.action ?? '0-Saved'] ?? 'text-zinc-400'}`}
        >
          {VALID_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <span className={`text-xs font-mono ${clipColor(clippedIso)}`}>
          {fmtDate(clippedIso)}
        </span>

        {genStatus === 'done' && <span className="text-green-400 text-xs">✓</span>}
        {genStatus === 'failed' && <span className="text-red-400 text-xs">✗</span>}
        {!genStatus && job.has_output ? <span className="text-green-400 text-xs">✓</span> : null}
      </div>
    </div>
  )
}
