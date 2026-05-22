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
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Contact</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['name', 'email', 'location', 'linkedin', 'github', 'website'] as const).map(f => (
            <div key={f} className="space-y-1">
              <label className="text-xs text-zinc-500 capitalize">{f}</label>
              <input
                value={local.contact?.[f] ?? ''}
                onChange={e => setContact(f, e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>
      </section>

      {(local.experience ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Work Experience ({local.experience!.length})
          </h2>
          {local.experience!.map(exp => (
            <div key={exp.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
              <div className="flex gap-2 flex-wrap text-sm">
                <span className="font-medium text-zinc-200">{exp.title ?? '—'}</span>
                <span className="text-zinc-400">@ {exp.company ?? '—'}</span>
                {exp.dates && <span className="text-xs text-zinc-500 self-center">{exp.dates}</span>}
              </div>
              {(exp.bullets?.genai ?? []).map((b, i) => (
                <p key={i} className="text-xs text-zinc-400 pl-2 border-l border-zinc-700">{b}</p>
              ))}
            </div>
          ))}
        </section>
      )}

      {(local.projects ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Projects ({local.projects!.length})
          </h2>
          {local.projects!.map(proj => (
            <div key={proj.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
              <div className="flex gap-2 flex-wrap text-sm">
                <span className="font-medium text-zinc-200">{proj.name ?? proj.id}</span>
                {proj.short_stack && <span className="text-xs text-zinc-500 self-center">{proj.short_stack}</span>}
              </div>
              {(proj.bullets ?? []).map((b, i) => (
                <p key={i} className="text-xs text-zinc-400 pl-2 border-l border-zinc-700">{b}</p>
              ))}
            </div>
          ))}
        </section>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg">
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
