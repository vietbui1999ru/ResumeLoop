const MAX_BULLET = 116

type ProfileJson = {
  experience?: Array<{ id: string; bullets: Record<string, string[]> }>
  projects?: Array<{ id: string; bullets: string[] }>
}

export function validateBulletsJson(json: string): string | null {
  let parsed: ProfileJson
  try {
    parsed = JSON.parse(json) as ProfileJson
  } catch {
    return 'Invalid JSON: fix syntax errors before saving'
  }

  const violations: string[] = []

  for (const exp of parsed.experience ?? []) {
    for (const [variant, bullets] of Object.entries(exp.bullets ?? {})) {
      for (const b of bullets) {
        if (b.length > MAX_BULLET) {
          violations.push(`experience/${exp.id}/${variant}: ${b.length} chars (max ${MAX_BULLET})`)
        }
      }
    }
  }

  for (const proj of parsed.projects ?? []) {
    for (const b of proj.bullets ?? []) {
      if (b.length > MAX_BULLET) {
        violations.push(`projects/${proj.id}: ${b.length} chars (max ${MAX_BULLET})`)
      }
    }
  }

  if (violations.length === 0) return null
  return `Bullets over ${MAX_BULLET} chars:\n${violations.join('\n')}`
}
