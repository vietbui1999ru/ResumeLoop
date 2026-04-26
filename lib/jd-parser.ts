import matter from 'gray-matter'
import path from 'path'

export interface JdJob {
  id: string
  file_path: string
  company: string
  role_title: string
  tags: string        // JSON-encoded string[]
  visa_status: string // 'proceed' | 'kill' | 'unknown'
  raw_content: string
}

const VISA_KILL_PATTERNS = [
  /us\s+citizen\s*(or|\/)\s*(green\s+card|gc)/i,
  /green\s+card\s*(or|\/)\s*us\s+citizen/i,
  /no\s+sponsorship/i,
  /must\s+be\s+(a\s+)?(us|u\.s\.)\s+citizen/i,
  /us\s+person/i,
  /export\s+control/i,
]

const VISA_PROCEED_PATTERNS = [
  /authorized\s+to\s+work\s+in\s+the\s+us/i,
  /work\s+authorization\s+required/i,
  /equal\s+opportunity\s+employer/i,
]

function detectVisa(text: string): string {
  if (VISA_KILL_PATTERNS.some(re => re.test(text))) return 'kill'
  if (VISA_PROCEED_PATTERNS.some(re => re.test(text))) return 'proceed'
  return 'unknown'
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80)
}

function parseTitle(fmTitle: string, filename: string): { company: string; role_title: string } {
  // Frontmatter title: "(1) IT Intern | Alta Equipment Group"
  const m = fmTitle.match(/^\(\d+\)\s+(.+?)\s*\|\s*(.+)$/)
  if (m) return { role_title: m[1].trim(), company: m[2].trim() }
  // Fallback: filename "(1) Role  Company.md"
  const base = filename.replace(/\.md$/, '')
  const parts = base.split(/\s{2,}/)
  const company = parts[parts.length - 1] ?? 'Unknown'
  const role_title = (parts[0] ?? base).replace(/^\(\d+\)\s+/, '').trim()
  return { company, role_title }
}

export function parseJd(filePath: string, content: string): JdJob {
  const { data: fm, content: body } = matter(content)
  const filename = path.basename(filePath)
  const { company, role_title } = parseTitle(String(fm.title ?? ''), filename)
  const tags: string[] = Array.isArray(fm.tags) ? fm.tags : []
  const id = toSlug(`${company} ${role_title}`.slice(0, 60)) || toSlug(filename)

  return {
    id,
    file_path: filePath,
    company,
    role_title,
    tags: JSON.stringify(tags),
    visa_status: detectVisa(body),
    raw_content: body,
  }
}
