import Anthropic from '@anthropic-ai/sdk'

export interface ProjectEntry {
  id: string
  name: string
  summary: string
  short_stack: string
  bullets: string[]
}

export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
  } catch {
    return null
  }
}

export function validateBullets(bullets: string[]): string[] {
  return bullets.map(b => {
    if (b.length <= 116) return b
    const trimmed = b.slice(0, 116)
    const lastSpace = trimmed.lastIndexOf(' ')
    return lastSpace > 90 ? trimmed.slice(0, lastSpace) : trimmed
  })
}

async function fetchReadme(owner: string, repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/README.md`
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github.raw' } })
  if (res.status === 404) return '(README not found)'
  if (!res.ok) throw new Error(`GitHub API error ${res.status} fetching README`)
  return (await res.text()).slice(0, 6000)
}

async function fetchFileTree(owner: string, repo: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=0`
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub API error ${res.status} fetching tree`)
  const data = await res.json() as { tree?: Array<{ path: string; type: string }> }
  return (data.tree ?? [])
    .filter(f => f.type === 'blob' || f.type === 'tree')
    .map(f => f.path)
    .slice(0, 100)
}

const SUMMARIZE_TOOL: Anthropic.Tool = {
  name: 'summarize_repo',
  description: 'Summarize a GitHub repo as a resume project entry',
  input_schema: {
    type: 'object' as const,
    properties: {
      id:          { type: 'string', description: 'URL-safe slug for master_resume_data.json' },
      name:        { type: 'string', description: 'Display name' },
      summary:     { type: 'string', maxLength: 120, description: 'One-sentence project description' },
      short_stack: { type: 'string', maxLength: 40, description: '3-4 primary techs joined by " · "' },
      bullets: {
        type: 'array',
        items: { type: 'string', maxLength: 116 },
        minItems: 3,
        maxItems: 5,
        description: 'Achievement bullets: "Built A doing B using C, which produced D". Each must include ≥1 tech + ≥1 result. ≤116 chars each.',
      },
    },
    required: ['id', 'name', 'summary', 'short_stack', 'bullets'],
  },
}

const SUMMARIZE_SYSTEM = `You are building resume bullet points for Quoc-Viet Bui.
Given a GitHub repo README and file tree, extract a project entry suitable for a software engineering resume.
Bullet formula: "Built A doing B using C, which produced D" — each bullet must include ≥1 named technology and ≥1 measurable or observable result.
Each bullet must be ≤116 characters with spaces. short_stack must be ≤40 chars total.`

export async function summarizeRepo(owner: string, repo: string): Promise<ProjectEntry> {
  const [readme, tree] = await Promise.all([
    fetchReadme(owner, repo),
    fetchFileTree(owner, repo),
  ])

  const userPrompt = `Repository: ${owner}/${repo}

File tree:
${tree.slice(0, 60).join('\n')}

README:
${readme}`

  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: SUMMARIZE_SYSTEM,
    tools: [SUMMARIZE_TOOL],
    tool_choice: { type: 'tool', name: 'summarize_repo' },
    messages: [{ role: 'user', content: userPrompt }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool_use in summarize response')

  const entry = toolUse.input as ProjectEntry
  if (typeof entry.id !== 'string' || !entry.id) throw new Error('summarize_repo: missing id')
  if (typeof entry.name !== 'string' || !entry.name) throw new Error('summarize_repo: missing name')
  if (!Array.isArray(entry.bullets) || entry.bullets.length === 0) throw new Error('summarize_repo: bullets must be a non-empty array')
  entry.bullets = validateBullets(entry.bullets)
  return entry
}
