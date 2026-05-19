const MAX_BULLET = 116

export function charColor(len: number): string {
  if (len > MAX_BULLET) return 'border-red-500 text-red-300 bg-red-950/20'
  if (len > 100)        return 'border-amber-500 text-amber-200 bg-amber-950/10'
  return 'border-zinc-700 text-zinc-300'
}

export function BulletsPreview({ json, onJump }: { json: string; onJump?: (path: string) => void }) {
  let parsed: {
    experience?: Array<{ id: string; bullets: Record<string, string[]> }>
    projects?:   Array<{ id: string; name?: string; bullets: string[] }>
  } | null = null

  try { parsed = JSON.parse(json) } catch { /* ignore */ }

  if (!parsed) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs font-mono px-4">
        {json ? 'Invalid JSON — fix syntax errors to see preview' : 'No profile loaded'}
      </div>
    )
  }

  const experience = parsed.experience ?? []
  const projects   = parsed.projects ?? []

  const rawSkills = (parsed as Record<string, unknown>).skills ?? []
  type SkillRow = { variant?: string; label: string; value: string }
  const skillRows: SkillRow[] = (() => {
    if (Array.isArray(rawSkills)) {
      return (rawSkills as unknown[]).map((v, i) =>
        typeof v === 'string' ? { label: `row ${i}`, value: v } : { label: `row ${i}`, value: JSON.stringify(v) }
      )
    }
    if (typeof rawSkills !== 'object' || rawSkills === null) return []
    const rows: SkillRow[] = []
    for (const [k, v] of Object.entries(rawSkills as Record<string, unknown>)) {
      if (typeof v === 'string') {
        rows.push({ label: k, value: v })
      } else if (typeof v === 'object' && v !== null) {
        for (const [cat, val] of Object.entries(v as Record<string, unknown>)) {
          rows.push({ variant: k, label: cat, value: typeof val === 'string' ? val : JSON.stringify(val) })
        }
      }
    }
    return rows
  })()

  if (experience.length === 0 && projects.length === 0 && skillRows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs font-mono px-4">
        No entries found. Expected: experience[], projects[], skills[]
      </div>
    )
  }

  const jumpable = onJump != null
  const itemCls = (len: number) =>
    `flex items-start gap-2 border-l-2 pl-2 py-0.5 mb-0.5 ${charColor(len)} ${jumpable ? 'cursor-pointer hover:opacity-80' : ''}`

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-xs font-mono">
      {experience.length > 0 && (
        <section>
          <p className="text-zinc-500 uppercase tracking-widest text-2xs mb-2">Work</p>
          {experience.map((exp, ei) => (
            <div key={exp.id} className="mb-3">
              <p
                className={`text-indigo-400 mb-1 ${jumpable ? 'cursor-pointer hover:text-indigo-300' : ''}`}
                onClick={() => onJump?.(`/experience/${ei}`)}
              >{exp.id}</p>
              {Object.entries(exp.bullets).map(([variant, bullets]) => (
                <div key={variant} className="mb-2 ml-2">
                  <p className="text-zinc-400 text-2xs mb-1">[{variant}]</p>
                  {(bullets as string[]).map((b, bi) => {
                    const len = b.length
                    return (
                      <div key={bi} className={itemCls(len)} onClick={() => onJump?.(`/experience/${ei}/bullets/${variant}/${bi}`)}>
                        <span className="flex-1 leading-relaxed">{b}</span>
                        <span className={`shrink-0 tabular-nums text-2xs ${len > MAX_BULLET ? 'text-red-400 font-bold' : len > 100 ? 'text-amber-500' : 'text-zinc-400'}`}>{len}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section>
          <p className="text-zinc-500 uppercase tracking-widest text-2xs mb-2">Projects</p>
          {projects.map((proj, pi) => (
            <div key={proj.id} className="mb-3">
              <p
                className={`text-indigo-400 mb-1 ${jumpable ? 'cursor-pointer hover:text-indigo-300' : ''}`}
                onClick={() => onJump?.(`/projects/${pi}`)}
              >{proj.name ?? proj.id}</p>
              {(proj.bullets ?? []).map((b, bi) => {
                const len = b.length
                return (
                  <div key={bi} className={itemCls(len)} onClick={() => onJump?.(`/projects/${pi}/bullets/${bi}`)}>
                    <span className="flex-1 leading-relaxed">{b}</span>
                    <span className={`shrink-0 tabular-nums text-2xs ${len > MAX_BULLET ? 'text-red-400 font-bold' : len > 100 ? 'text-amber-500' : 'text-zinc-400'}`}>{len}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      )}

      {skillRows.length > 0 && (
        <section>
          <p className="text-zinc-500 uppercase tracking-widest text-2xs mb-2">Skills</p>
          {skillRows.map((row, si) => (
            <div key={si} className={`flex items-start gap-2 border-l-2 pl-2 py-0.5 mb-0.5 ${charColor(row.value.length)}`}>
              <span className="flex-1 leading-relaxed">
                {row.variant && <span className="text-zinc-500 mr-1">[{row.variant}]</span>}
                <span className="text-zinc-400 mr-1">{row.label}:</span>
                {row.value}
              </span>
              <span className="shrink-0 text-zinc-400 text-2xs">{row.value.length}</span>
            </div>
          ))}
        </section>
      )}

      <p className="text-zinc-500 text-2xs pt-2 border-t border-zinc-800">
        ● {MAX_BULLET} char max · red = over · amber = 100–116
      </p>
    </div>
  )
}
