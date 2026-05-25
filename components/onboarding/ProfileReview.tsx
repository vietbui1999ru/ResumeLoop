'use client'
import { useState }         from 'react'
import type { SparseProfile, ConflictEntry } from '@/lib/ingest/types'
import { ConflictBanner }   from './ConflictBanner'

interface Props {
  profile:   SparseProfile
  conflicts: ConflictEntry[]
  onAccept:  (profile: SparseProfile) => void
  onBack:    () => void
  saving:    boolean
}

export function ProfileReview({ profile, conflicts, onAccept, onBack, saving }: Props) {
  const [local, setLocal] = useState<SparseProfile>(profile)

  const setContact = (key: keyof NonNullable<SparseProfile['contact']>, val: string) =>
    setLocal(p => ({ ...p, contact: { ...p.contact, [key]: val } }))

  return (
    <div className="space-y-6">
      <ConflictBanner conflicts={conflicts} />

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Contact</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['name', 'email', 'location', 'linkedin', 'github', 'website'] as const).map(f => (
            <div key={f} className="space-y-1">
              <label className="text-xs text-text-muted capitalize">{f}</label>
              <input
                value={local.contact?.[f] ?? ''}
                onChange={e => setContact(f, e.target.value)}
                className="w-full bg-surface-raised border border-border-default rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>
      </section>

      {(local.experience ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Work Experience ({local.experience!.length})
          </h2>
          {local.experience!.map(exp => (
            <div key={exp.id} className="bg-surface-card border border-border-subtle rounded-lg p-4 space-y-2">
              <div className="flex gap-2 flex-wrap text-sm">
                <span className="font-medium text-text-primary">{exp.title ?? '—'}</span>
                <span className="text-text-secondary">@ {exp.company ?? '—'}</span>
                {exp.dates && <span className="text-xs text-text-muted self-center">{exp.dates}</span>}
              </div>
              {(exp.bullets?.genai ?? []).map((b, i) => (
                <p key={i} className="text-xs text-text-secondary pl-2 border-l border-border-default">{b}</p>
              ))}
            </div>
          ))}
        </section>
      )}

      {(local.projects ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Projects ({local.projects!.length})
          </h2>
          {local.projects!.map(proj => (
            <div key={proj.id} className="bg-surface-card border border-border-subtle rounded-lg p-4 space-y-2">
              <div className="flex gap-2 flex-wrap text-sm">
                <span className="font-medium text-text-primary">{proj.name ?? proj.id}</span>
                {proj.short_stack && <span className="text-xs text-text-muted self-center">{proj.short_stack}</span>}
              </div>
              {(proj.bullets ?? []).map((b, i) => (
                <p key={i} className="text-xs text-text-secondary pl-2 border-l border-border-default">{b}</p>
              ))}
            </div>
          ))}
        </section>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary border border-border-default rounded-lg">
          ← Add more sources
        </button>
        <button
          onClick={() => onAccept(local)} disabled={saving}
          className="flex-1 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Accept profile'}
        </button>
      </div>
    </div>
  )
}
