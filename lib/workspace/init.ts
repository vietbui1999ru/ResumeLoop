import fs from 'node:fs'
import path from 'node:path'
import { dataDir, jobsDir, evaluationsDir, resumesDir, profilePath } from './paths'

/** Blank profile template (master_resume_data shape). Seeded on init, filled by onboarding. */
const PROFILE_TEMPLATE = {
  contact: { name: '', email: '', phone: '', location: '', linkedin: '', portfolio: '' },
  education: [],
  experience: [],
  projects: [],
  skills: { genai: {} },
}

const GITIGNORE = `# ResumeLoop workspace — files are canonical; the index is rebuildable.
.cache/
`

const JOBS_README = `# jobs/

One markdown file per job description. Frontmatter drives the index:

\`\`\`md
---
company: Acme
role_title: Software Engineer
source: https://acme.example/careers/123
Action: 0
---

<job description text>
\`\`\`
`

/**
 * Scaffold a files-canonical workspace at \`root\`. Idempotent: never overwrites
 * an existing profile.json or job files. Returns the paths it created.
 */
export function initWorkspace(root: string): { created: string[] } {
  const created: string[] = []
  const ensureDir = (d: string) => {
    if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); created.push(d) }
  }
  const writeIfAbsent = (file: string, content: string) => {
    if (!fs.existsSync(file)) { fs.writeFileSync(file, content); created.push(file) }
  }

  ensureDir(dataDir(root))
  ensureDir(jobsDir(root))
  ensureDir(evaluationsDir(root))
  ensureDir(resumesDir(root))
  ensureDir(path.join(root, '.cache'))

  writeIfAbsent(profilePath(root), JSON.stringify(PROFILE_TEMPLATE, null, 2) + '\n')
  writeIfAbsent(path.join(root, '.gitignore'), GITIGNORE)
  writeIfAbsent(path.join(jobsDir(root), 'README.md'), JOBS_README)

  return { created }
}
