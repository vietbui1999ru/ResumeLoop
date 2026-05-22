type ProfileJson = {
  experience?: Array<{ id: string; bullets: Record<string, string[]> }>
  projects?: Array<{ id: string; name?: string; bullets: string[] }>
}

export function toBulletsMarkdown(json: string): string {
  let parsed: ProfileJson
  try {
    parsed = JSON.parse(json) as ProfileJson
  } catch {
    return ''
  }

  const sections: string[] = []

  for (const exp of parsed.experience ?? []) {
    const bullets = Object.values(exp.bullets).flat()
    if (bullets.length === 0) continue
    sections.push(`## ${exp.id}\n${bullets.map(b => `- ${b}`).join('\n')}`)
  }

  for (const proj of parsed.projects ?? []) {
    const bullets = proj.bullets ?? []
    if (bullets.length === 0) continue
    const header = proj.name ?? proj.id
    sections.push(`## ${header}\n${bullets.map(b => `- ${b}`).join('\n')}`)
  }

  return sections.join('\n\n')
}
