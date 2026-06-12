---
title: "Onboarding Ingestion"
description: "How users inject their own data into ResumeLoop — paste, GitHub, and URL extractors, AI-powered merge, and the onboarding gate."
tags: [ingest, onboarding, profile, ai]
updated: 2026-05-21
---

# Onboarding Ingestion

ResumeLoop replaces the old demo-seed new-user flow with a source-card onboarding board. Users supply their own data — LinkedIn copy-paste, GitHub username, or a personal website URL — and the AI extracts it into a structured profile ready for resume generation.

---

## How It Works

```
User supplies input (text / GitHub / URL)
        │
        │  POST /api/ingest/{paste|github|url}
        ▼
  Source-specific extractor (AI tool-use)
        │  → SparseProfile (partial — only what was found)
        ▼
  ingestion_sources row (status: done)
        │
        │  (user adds more sources as needed)
        │
        │  POST /api/ingest/merge
        ▼
  AI merge (most-specific-wins + additive arrays)
        │  → MergeResult { profile, conflicts[] }
        ▼
  User reviews conflicts, accepts merged profile
        │
        │  Profile accepted → data/profile.json written
        ▼
  Generation pipeline ready
```

---

## Source Types

### Paste (freeform text)

Any text input: LinkedIn About section, LinkedIn Experience copy-paste, a plain bio, a raw resume. The AI extracts `contact`, `experience`, `projects`, and `skills` from whatever is present — it never invents data not in the text.

**Minimum length:** 20 characters.
**Text limit:** First 20,000 characters are used.

**API:** `POST /api/ingest/paste`

```json
{ "text": "Jane Doe. Senior Engineer at Acme Corp. Built distributed systems…" }
```

**Extracted fields:** full profile (`contact`, `experience[]`, `projects[]`, `skills.genai`)

---

### GitHub

Accepts a GitHub profile URL, repository URL, or bare username.

**Valid inputs:**
- `https://github.com/janedoe` — profile mode (fetches top 6 repos by last-updated)
- `https://github.com/janedoe/my-repo` — repo mode (fetches that repo only)
- `janedoe` — bare username, treated as profile mode

The extractor calls the GitHub public API (no auth token required):
1. Fetches user profile (`/users/{username}`)
2. Fetches profile README (the `{username}/{username}` repo README, if it exists)
3. Fetches up to 6 repos with their READMEs (truncated to 1,500 chars each)

The AI produces `projects[]` from the repositories and `candidate_profile.narrative` from the bio and profile README. It deliberately **does not** extract `experience[]` — work history is not reliably inferable from GitHub repos.

**API:** `POST /api/ingest/github`

```json
{ "input": "https://github.com/janedoe" }
```

**Extracted fields:** `contact` (name, location, github, website), `projects[]`, `candidate_profile.narrative`

---

### URL (web page)

Scrapes any public URL — personal portfolio, company page, online resume, or any publicly accessible page.

The scraper works in two modes:

| Mode | When | Input limit |
|---|---|---|
| **Firecrawl** | Firecrawl API key is configured | 30,000 chars of clean Markdown |
| **Fetch fallback** | No Firecrawl key | 20,000 chars of stripped HTML text |

The fetch fallback strips `<script>`, `<style>`, and all other HTML tags, then collapses whitespace. This handles most static portfolio pages but may miss JavaScript-rendered content. Firecrawl handles SPAs and JS-heavy sites reliably.

See [Firecrawl setup](#firecrawl-optional) below.

**Timeout:** 15 seconds for the fetch fallback.

**API:** `POST /api/ingest/url`

```json
{ "url": "https://janedoe.com" }
```

**Extracted fields:** full profile (`contact`, `experience[]`, `projects[]`, `skills.genai`, `candidate_profile.narrative`)

---

## Merge

After adding one or more sources, call the merge endpoint to combine all `done` sources into a single profile.

**API:** `POST /api/ingest/merge` (no body)

**Rules the AI applies:**

| Data type | Strategy |
|---|---|
| Scalar fields (name, email, location…) | Most-specific-wins — prefer the most detailed/concrete value |
| Arrays (`experience[]`, `projects[]`) | Additive — union all unique entries, deduplicated by `id` |
| Conflicts | Surfaces a `ConflictEntry` when two sources give genuinely different values for the same scalar field |

**Single-source shortcut:** If only one `done` source exists, the merge endpoint returns that source's partial directly — no AI call is made.

**Response:**

```json
{
  "profile": { "contact": { "name": "Jane Doe" }, "projects": [...] },
  "conflicts": [
    {
      "field": "contact.name",
      "description": "Source 1 says 'Jane Doe', source 2 says 'J. Doe'",
      "sources": [
        { "sourceId": "s1", "sourceType": "paste", "value": "Jane Doe" },
        { "sourceId": "s2", "sourceType": "url",   "value": "J. Doe" }
      ]
    }
  ]
}
```

The onboarding UI presents conflicts to the user for manual resolution before the profile is accepted.

---

## Sources Management

**API:** `GET /api/ingest/sources`

Returns all `ingestion_sources` rows, newest first.

```json
{
  "sources": [
    {
      "id": "uuid",
      "type": "paste",
      "status": "done",
      "inputRaw": "Jane Doe…",
      "extractedPartial": { "contact": { "name": "Jane Doe" }, "experience": [...] },
      "errorMsg": null,
      "createdAt": 1716300000
    }
  ]
}
```

Source `status` values: `pending` → `processing` → `done` | `failed`.

**API:** `DELETE /api/ingest/sources?id=<sourceId>`

Deletes a single source row.

---

## SparseProfile Schema

All extractors and the merge output use the same `SparseProfile` type (`lib/ingest/types.ts`). Every field is optional — extractors only populate what they find.

```typescript
interface SparseProfile {
  contact?: {
    name?:     string
    email?:    string
    phone?:    string
    location?: string
    linkedin?: string
    github?:   string
    website?:  string
  }
  experience?: Array<{
    id:        string    // required — lowercase slug, e.g. "acme-corp"
    title?:    string
    company?:  string
    location?: string
    dates?:    string
    bullets?:  { genai: string[] }  // each bullet ≤ 116 chars
  }>
  projects?: Array<{
    id:           string  // required — lowercase slug
    name?:        string
    url?:         string
    short_stack?: string  // ≤ 40 chars, 3-4 technologies
    dates?:       string
    bullets?:     string[]  // each bullet ≤ 116 chars
  }>
  skills?: {
    genai?: Record<string, string>  // e.g. { "Languages": "Go, TypeScript, Python" }
  }
  candidate_profile?: {
    narrative?: string
  }
}
```

The `id` fields for experience and projects become lookup keys in the resume generation pipeline. Use lowercase slugs matching the format in `master_resume_data.json` (e.g., `"acme-corp"`, `"my-api"`).

---

## Onboarding Gate

Until a profile exists (no `data/profile.json` yet), the `OnboardingGate` client component redirects you to `/onboarding` after every navigation.

The gate calls `GET /api/profiles` client-side. You are redirected only if:
- You are not already on `/onboarding`
- The profile list is empty

After you accept a merged profile and `data/profile.json` is written, the gate check passes and normal navigation resumes.

---

## SmartInput: Automatic Type Detection

The onboarding page's input box detects the source type from what the user pastes — no dropdown required.

| Input pattern | Detected type | Sent to |
|---|---|---|
| `https://github.com/…` | `github` | `/api/ingest/github` |
| `https://…` or `http://…` | `url` | `/api/ingest/url` |
| Bare username (1-39 chars, no spaces) | `github` | `/api/ingest/github` |
| Everything else | `paste` | `/api/ingest/paste` |

The SmartInput renders a confirmation chip ("Detected: github") and a submit button labeled with the action ("Extract GitHub profile"). If nothing is typed, no button appears.

---

## Firecrawl (Optional)

[Firecrawl](https://firecrawl.dev) is a web scraping service that returns clean Markdown from any URL, including JavaScript-rendered pages.

**To configure:**

1. Go to **Settings** → scroll to **Firecrawl API Key**
2. Enter your key (format: `fc-…`)
3. Click **Save**

The key is stored in the `app_settings` table under the key `firecrawl_key`. The key field is rendered as a password input so the key is not visible.

Without Firecrawl, URL ingestion uses a plain `fetch` + HTML stripping fallback. Most static portfolio pages work fine. SPAs (React, Vue, Next.js) may return empty or partial content without Firecrawl.

---

## Error Handling

| Error | HTTP status | Cause |
|---|---|---|
| `text required` | 400 | Empty body on paste endpoint |
| `Input too short…` | 422 | Paste text under 20 chars |
| `Invalid GitHub input…` | 400 | Non-GitHub URL or invalid username format |
| `GitHub user not found…` | 422 | Username does not exist or GitHub API is rate-limited |
| `Invalid URL` | 400 | Malformed URL on url endpoint |
| `Failed to fetch URL: HTTP …` | 422 | URL returned non-2xx response |
| `No AI provider configured` | 422 | No AI CLI / endpoint selected in Settings → AI Provider |
| `No completed sources to merge` | 422 | Merge called with zero done sources |

Failed sources have `status = 'failed'` and `errorMsg` set to the error message. They remain in the source board so the user can diagnose and re-submit.

---

## AI Usage Logging

Every extraction and merge call logs token usage to `ai_usage_log` under these feature names:

| Feature key | Operation |
|---|---|
| `ingest-paste` | Paste extraction |
| `ingest-github` | GitHub extraction |
| `ingest-url` | URL extraction |
| `ingest-merge` | Multi-source merge |

Query:

```sql
SELECT feature, SUM(input_tok) AS input, SUM(output_tok) AS output, COUNT(*) AS calls
FROM ai_usage_log
WHERE feature LIKE 'ingest-%'
GROUP BY feature;
```

---

## Related Pages

- [`docs/features.md`](features.md) — Onboarding user flow
- [`docs/database.md`](database.md) — `ingestion_sources` table schema
- [`docs/ai-providers.md`](ai-providers.md) — AI provider configuration
