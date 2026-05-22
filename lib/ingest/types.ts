export type IngestionSourceType   = 'url' | 'github' | 'paste'
export type IngestionSourceStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface SparseContact {
  name?:     string
  email?:    string
  phone?:    string
  location?: string
  linkedin?: string
  github?:   string
  website?:  string
}

export interface SparseExperienceEntry {
  id:        string   // required — lowercase slug, e.g. "acme-corp"
  title?:    string
  company?:  string
  location?: string
  dates?:    string
  bullets?:  { genai: string[] }
}

export interface SparseProjectEntry {
  id:           string  // required — lowercase slug
  name?:        string
  url?:         string
  short_stack?: string  // ≤40 chars
  dates?:       string
  bullets?:     string[]
}

export interface SparseProfile {
  contact?:           SparseContact
  experience?:        SparseExperienceEntry[]
  projects?:          SparseProjectEntry[]
  skills?:            { genai?: Record<string, string> }
  candidate_profile?: { narrative?: string }
}

export interface ConflictEntry {
  field:       string   // e.g. "contact.name"
  description: string
  sources: Array<{
    sourceId:   string
    sourceType: IngestionSourceType
    value:      unknown
  }>
}

export interface MergeResult {
  profile:   SparseProfile
  conflicts: ConflictEntry[]
}

// DB row shape (snake_case, as stored)
export interface IngestionSourceRow {
  id:                string
  user_id:           string
  type:              IngestionSourceType
  input_raw:         string
  status:            IngestionSourceStatus
  extracted_partial: string | null   // JSON string of SparseProfile
  error_msg:         string | null
  created_at:        number
}

// Application shape (camelCase)
export interface IngestionSource {
  id:               string
  userId:           string
  type:             IngestionSourceType
  inputRaw:         string
  status:           IngestionSourceStatus
  extractedPartial: SparseProfile | null
  errorMsg:         string | null
  createdAt:        number
}
