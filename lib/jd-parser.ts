import matter from 'gray-matter'
import path from 'path'
import { VALID_ACTIONS } from './actions'

export interface JdJob {
  id: string
  file_path: string
  company: string
  role_title: string
  tags: string        // JSON-encoded string[]
  visa_status: string // 'proceed' | 'kill' | 'unknown'
  action: string | null // null when no Action key in frontmatter (DB preserves existing value on scan)
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

// Strip noise suffixes from a role title: locations, posting IDs, level suffixes, job board names
function cleanRole(s: string): string {
  return s
    .replace(/\s*\|\s*(JobzMall|Indeed|LinkedIn|Glassdoor|Career Page|Careers at .+).*$/i, '')
    .replace(/\s*[-–—@]\s*([\w\s]+,\s+[A-Z]{2}[\s\d-]*).*$/, '') // "- City, ST 12345"
    .replace(/\s+in\s+[\w\s]+,\s+[A-Z]{2}(\s*\|.*)?$/i, '')       // "in Raleigh, NC"
    .replace(/\s*\(\d{4,}\)\s*$/, '')                               // trailing IDs "(210577)"
    .replace(/\s*[-–—]\s*(New Grad|Entry.?Level|Junior|I{1,3}V?|IV|V|\d+)\s*$/i, '')
    .trim()
}

function parseTitle(fmTitle: string, fmCompany: string, filename: string): { company: string; role_title: string } {
  const t = fmTitle.trim()

  // 1. Old Obsidian format: "(1) Role Title | Company"
  const numbered = t.match(/^\(\d+\)\s+(.+?)\s*\|\s*(.+)$/)
  if (numbered) return { role_title: cleanRole(numbered[1].trim()), company: numbered[2].trim() }

  // 2. fm.Company field is populated
  if (fmCompany && fmCompany.trim()) {
    return { role_title: cleanRole(t), company: fmCompany.trim() }
  }

  // 3. "Role | Company" without numbering
  if (t.includes(' | ')) {
    const [left, right] = t.split(/\s*\|\s*/, 2)
    // right side might be a job board — use only if it looks like a company name (short, no .com)
    const isCompany = right.length < 60 && !right.match(/\.(com|io|net|org)/i)
    if (isCompany) return { role_title: cleanRole(left), company: right.trim() }
    return { role_title: cleanRole(left), company: 'Unknown' }
  }

  // 4. "Role at Company" or "Role @ Company"
  const atMatch = t.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i)
  if (atMatch) return { role_title: cleanRole(atMatch[1]), company: cleanRole(atMatch[2]) }

  // 5. "Role, Company - Context" (e.g. "iOS Software Engineer, Airbnb - New Grad")
  const commaCompany = t.match(/^(.+?),\s+([A-Z][A-Za-z0-9& ]+?)\s*(?:-|–|—|$)/)
  if (commaCompany) {
    const candidate = commaCompany[2].trim()
    // Only treat as company if it's 1-4 words and looks like a proper noun
    if (candidate.split(/\s+/).length <= 4 && /^[A-Z]/.test(candidate)) {
      return { role_title: cleanRole(commaCompany[1]), company: candidate }
    }
  }

  // 6. "Role – Company" or "Role — Company" (em/en dash)
  const dashMatch = t.match(/^(.+?)\s*[–—]\s*(.+)$/)
  if (dashMatch) {
    const right = dashMatch[2].trim()
    const isShortCompany = right.split(/\s+/).length <= 5 && !right.match(/\d{5}/)
    if (isShortCompany) return { role_title: cleanRole(dashMatch[1]), company: right }
  }

  // 7. Fallback: use cleaned title as role, derive company from filename
  const base = filename.replace(/\.md$/, '')
  const fileParts = base.split(/\s{2,}/)
  const company = fileParts.length > 1 ? fileParts[fileParts.length - 1] : 'Unknown'
  return { role_title: cleanRole(t) || cleanRole(base), company }
}

export function parseJd(filePath: string, content: string): JdJob {
  const { data: fm, content: body } = matter(content)
  const filename = path.basename(filePath)
  const fmCompany = String(fm.Company ?? fm.company ?? '')
  const { company, role_title } = parseTitle(String(fm.title ?? ''), fmCompany, filename)
  const tags: string[] = Array.isArray(fm.tags) ? fm.tags : []
  const id = toSlug(`${company} ${role_title}`.slice(0, 60)) || toSlug(filename)

  return {
    id,
    file_path: filePath,
    company,
    role_title,
    tags: JSON.stringify(tags),
    visa_status: detectVisa(body),
    action: fm.Action != null && (VALID_ACTIONS as readonly string[]).includes(String(fm.Action)) ? String(fm.Action) : null,
    raw_content: body,
  }
}
