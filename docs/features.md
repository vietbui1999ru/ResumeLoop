---
title: "Feature Guide"
description: "User-facing guide to every feature in ResumeLoop — onboarding, dashboard, jobs list, resume generation, chat, outreach, and settings."
tags: [guide, features, overview]
updated: 2026-05-21
---

# Feature Guide

ResumeLoop is a personal dashboard that turns job description Markdown files into tailored, ATS-optimized DOCX resumes. This guide covers every feature from first login to downloading a finished resume.

---

## Onboarding

New users are automatically redirected to `/onboarding` until they have at least one resume profile. The onboarding board lets you inject your own data from multiple sources and merge it into a profile — no demo seed data.

### Adding sources

The **SmartInput** box on the onboarding page detects what you paste and routes it to the correct extractor automatically:

| What you paste | Detected as | What happens |
|---|---|---|
| `https://github.com/username` or bare `username` | GitHub | Fetches public profile + top 6 repos via GitHub API |
| Any other `https://…` URL | URL | Scrapes the page (Firecrawl if configured, fetch fallback otherwise) |
| Anything else | Text | Sends the text directly to the AI extractor |

You can add as many sources as you like. Each source shows a status card:
- **Extracting…** (amber pulse) — AI is processing
- **Done** (green) — extraction succeeded; card shows a summary of what was found
- **Failed** (red) — shows the error message; fix the input and re-submit

### Merging

Once at least one source shows **Done**, click **Merge sources**. The AI combines all done sources into a single profile using these rules:
- **Scalar fields** (name, email, location): most-specific-wins
- **Arrays** (experience, projects): additive — all unique entries are kept, deduplicated by ID
- **Conflicts**: when two sources disagree on the same field, a conflict banner appears for you to resolve manually

### Accepting

After reviewing the merged profile and resolving any conflicts, click **Accept profile**. This writes your profile to `data/profile.json` (the runtime source of truth) and unlocks the rest of the app.

> For detailed API and schema documentation, see [`docs/ingest.md`](ingest.md).

---

## Access (no sign-in)

ResumeLoop is **local-first and single-user**. The app binds to `127.0.0.1`; your OS account is the trust boundary. There is no sign-up, no login, and no API key to store — you open the app and you are in.

The brain is **your own AI CLI** (`claude` / `codex` / `gemini` / `opencode`) or a local OpenAI-compatible endpoint, configured once in Settings (see [Settings → AI Provider](#ai-provider)).

> The hosted demo at [resumeloop.me](https://resumeloop.me) runs anonymous, ephemeral sessions backed by a small self-hosted model — also no account.

---

## Dashboard

The Dashboard (`/`) shows aggregate statistics computed from all scanned jobs. It is empty until you run at least one Scan.

| Panel | What it shows |
|---|---|
| Header stat line | Total JDs scanned · visa-kill count |
| Role Track chart | Distribution of role tracks across all jobs |
| Fit Distribution chart | Histogram of fit percentages across all jobs |
| Pipeline Sankey chart | Generation outcome flow (present only once resumes have been generated) |
| Output History table | List of generated resumes with build dates |

If no data exists yet, the Dashboard shows a prompt directing you to **Jobs → Scan**.

---

## Jobs List

The Jobs list (`/jobs`) is the main workspace for selecting and generating resumes.

### Columns

| Column | Description |
|---|---|
| Company | Company name from the JD file |
| Role | Job title |
| Track | Inferred role track (e.g., "Backend / API Engineer") |
| Fit% | AI-assigned fit percentage; green when ≥ 60 |
| Action | Application pipeline stage (see below) |
| Clipped | Date the JD was clipped into Obsidian (from `created:` frontmatter); falls back to scan date |
| Scanned | Date the JD was last scanned into the database |
| Visa | `proceed` (green) or `visa-kill` (red) based on visa requirement parsing |
| Status | Live generation progress or `★ Why?` link after generation |

### Action stages

Each job has an action dropdown editable directly in the table. Changes save immediately with optimistic UI rollback on error.

| Stage | Color |
|---|---|
| 0-Saved | Gray |
| 1-Applied | Cyan |
| 2-Phone Screen | Indigo |
| 3-Interview | Purple |
| 4-Offer | Green |
| 5-Rejected | Red |
| 6-Ghosted | Dark gray |

### Filtering and sorting

The filter bar above the table provides:

- **Search** — full-text search across company, role title, track, and JD body. Results update as you type (300 ms debounce).
- **Track** — filter to a single role track.
- **Tag** — filter by a tag value found in any job's frontmatter.
- **Fit ≥** — minimum fit percentage threshold.
- **Visa** — show only `proceed` jobs (default), only `visa-kill` jobs, or all.
- **Action stage** — filter to a single pipeline stage.
- **From date** — filter by `clipped_at` date (ISO format, client-side filtering).

Every column header is clickable to sort ascending or descending. Clicking the same column again toggles direction. Numeric columns (Fit%, Clipped, Scanned) default to descending on first click. Text columns default to ascending.

### Hidden jobs

Jobs can be marked as hidden to keep the list uncluttered. A **Show hidden** toggle in the filter bar displays hidden rows at 40% opacity with an amber highlight. Hidden jobs do not affect generation or metrics.

### Scanning

Click **Scan** to discover and parse all `.md` files in your configured Jobs folder. The scan reads frontmatter and body, extracts company, role title, track, fit percentage, visa status, and tags, then upserts each job into the database.

### Selecting and generating

Check individual rows to select them. The header checkbox selects or deselects all currently visible (filtered) rows. Click **Generate N selected** to start the generation pipeline for all selected jobs. See [Resume Generation](#resume-generation) for pipeline details.

### Status column

- While generating: shows the current pipeline stage (e.g., `⟳ ai-reason`).
- After success: shows `done` with a `★ Why?` button that opens the AI Reasoning modal.
- If a prior generation exists: shows `★ Why?` or `doc`.

### Clicking a row

Clicking anywhere on a row (except the checkbox and action dropdown) opens the **Job Detail Modal** for that job.

---

## Job Detail Modal

The modal opens when you click a job row. Press **Escape** or click outside the modal to close it. All panel state resets on close.

### Panel toolbar

A row of toggle buttons at the top of the modal controls which panels are visible: **JD**, **PDF**, **AI Why**, **Cover Letter**, and **Outreach**. Active panels are highlighted in indigo.

- Any combination of panels can be open simultaneously.
- The modal width scales automatically: narrow with one panel, wide with four.
- Drag any panel by its grip strip (the dotted bar at its top) to reorder them.

### JD panel

Shows structured metadata and the full raw Markdown content of the job description.

**Structured fields:**

| Field | Description |
|---|---|
| Track | Inferred role track |
| Fit | Fit percentage, green when ≥ 60 |
| Action | Current pipeline stage |
| Visa | `proceed` or `visa-kill` |
| Clipped | JD file last-modified date |
| Scanned | Last scan date |
| Apply URL | Link to the application form; click to edit inline. Saved to database with user edits preserved on rescan. |
| Tags | Frontmatter tags rendered as chips |

**Action links** (appear after a resume has been generated):

- **Open file** — opens the raw JD Markdown file in your system.
- **Apply ↗** — shortcut link to the Apply URL (if set).
- **DOCX** — downloads the generated DOCX resume for this job.
- **Cover Letter** — triggers cover letter generation (see below).

Below the action links, if a resume exists, a **Resume Output** block shows the AI-chosen tagline, work variant track, and build date.

The lower portion of the panel renders the full JD Markdown.

### PDF panel

Renders a live PDF preview of the generated resume using the browser's native PDF viewer.

If no resume has been generated yet, the panel shows: "No PDF available. Generate a resume first."

### AI Why panel

Displays the AI's reasoning for all resume selections made during generation. The reasoning is structured Markdown with five sections:

| Section | What it explains |
|---|---|
| Track | Why the role track was chosen |
| Work Experience | Which work IDs were selected and why they match the JD |
| Projects | Which three projects were chosen and the JD keywords they target |
| Tagline | Why the generated tagline fits the role |
| Skills | How the five skills rows were composed for this JD |

If no resume has been generated, the panel shows a prompt to generate first.

### Outreach panel

Tracks contacts and companies associated with a job, and generates AI-drafted LinkedIn and email messages.

The panel is always available — it does not require a resume to have been generated first.

#### Adding contacts

Click **Browse** (or use the file picker) to select one or more Markdown files from your vault. Typically these are Obsidian web clips of LinkedIn profiles or company pages. Select the files and click **Ingest** to import them. The app reads each file and uses the AI to generate a structured contact card.

#### Contact card

Each imported contact gets an AI-generated card containing:

| Field | Description |
|---|---|
| Name | Contact's full name |
| Current role | Their title and organization |
| Background | 2–3 sentence summary |
| Relevance | Why this contact is relevant to your application |
| Talking points | 3 bullet points for outreach angle |

#### Contact fields

After ingestion you can edit each contact directly in the panel:

- **Role** — classify the contact as `Hiring Manager`, `Recruiter`, `Engineer`, `Alumni`, `Other` (free-text when Other is selected)
- **Status** — `Not contacted` / `Contacted` / `Replied` / `No response`
- **Email** — contact email address (AI-suggested if found in the source file)
- **Notes** — free-text notes

#### Drafts

Click **Draft messages** on a contact to generate:

- **LinkedIn message** (≤ 300 chars) — concise connection request that references the role
- **Email** — 3-paragraph message referencing the job, their background, and a specific talking point

Both drafts are editable inline before you copy or send them. Click **Regenerate** to produce a new version.

#### Job brief

The top of the Outreach panel shows an AI-generated outreach brief for the job: company summary, key hiring signals, and 3 recommended outreach angles. Click **Generate brief** if it is not yet present.

---

### Cover Letter panel

Generates a 3-paragraph, 200–250 word cover letter written from the context of the already-generated resume.

- Click **Generate** (or the **Cover Letter** button in the JD panel) to start streaming generation.
- Text streams in real time while the button shows "Generating…".
- After generation, click **Copy** to copy the full text to the clipboard.
- Click **Regenerate** to produce a new version.
- If no resume exists yet, the panel shows a prompt to generate the resume first.

The cover letter uses the resume's tagline, work track, project selection, and AI reasoning as context, plus the full JD content.

---

## Resume Generation

The full pipeline runs server-side over SSE (Server-Sent Events). Progress is shown live in the Generation Panel that appears below the filter bar.

### Starting generation

1. Scan your jobs folder (click **Scan** on the Jobs page).
2. Review the resulting list. Filter to jobs you want to apply for.
3. Check one or more job rows.
4. Click **Generate N selected**.

### Pipeline stages

Each job passes through these stages in order:

| Stage | What happens |
|---|---|
| `preflight` | Creates the build directory, copies `master_resume_data.json` and `buildv2.js` into it, installs `docx` if needed. |
| `ai-reason` | Runs your configured AI CLI through the provider adapter (`lib/providers/`) with the JD and your profile. The AI returns a validated `SpineDecision`: role track, work variant (`genai` / `systems` / `fullstack` / `sre` / `IT-track`), three work experience IDs, three project IDs, a tagline (≤ 76 chars), five skills rows, and a reasoning narrative. |
| `write-script` | Writes a Node.js build script that passes the AI's selections to `buildv2.js`. |
| `build` | Runs the build script with `node`. Produces a DOCX file. |
| `validate` | Runs `validate.js` to check hard limits (tagline ≤ 76 chars, bullets ≤ 116 chars). |
| `fix-loop` | If validation fails, applies automatic fixes and retries. Tagline overruns are trimmed at a word boundary. Bullet overruns are not auto-fixed and will fail the pipeline. Up to 3 attempts total. |
| `pdf` | Renders a polished PDF via the Playwright HTML→PDF template (headless Chromium, no LibreOffice). Non-fatal: generation continues even if PDF rendering fails. |
| `finalize` | Writes the DOCX and PDF to `data/resumes/`, records the output in the local index, and updates the JD frontmatter tag from `un-resume` to `resume-ed`. |

### Stage indicators

Each stage row in the Generation Panel shows:

- `⟳` — currently running
- `✓` — completed successfully
- `✗` — failed

Inline summaries appear where applicable: tagline text after `ai-reason`, script filename after `write-script`, violation descriptions after `validate`.

### After generation

- A **Download DOCX** link appears in the Generation Panel.
- The **Status** column in the job table updates to `done` with a `★ Why?` button.
- The JD file's `un-resume` frontmatter tag is replaced with `resume-ed`.
- Open the Job Detail Modal to preview the PDF or generate a cover letter.

### Rating feedback

After each job completes, a 1–3 rating widget appears in the Generation Panel. Optionally add a note and click **Submit** to log feedback.

---

## Resume Profiles

Resume Profiles let you maintain multiple named variants of your resume data (the `profile.json` shape). Each profile is a separate named snapshot in your workspace, and you can activate one to use it for all future generations.

### Accessing profiles

Profiles are managed via the **Settings** page, visible from the left sidebar.

### Managing profiles

**Create a new profile** — click **+ New profile**. Choose from:
- **Fork active** — copy the current active profile
- **Upload JSON** — import a `master_resume_data.json` file from disk
- **Seed from disk** — import the current disk file

**Switch to a profile** — click the profile name in the dropdown at the top of the page. The **active** badge shows the currently active profile (used in generation).

**Rename** — click the pencil icon next to a profile name to edit it.

**Delete** — profiles can be deleted. The default disk profile cannot be deleted; it is always available as a fallback.

**Fork** — copy an existing profile to create a new variant.

**Save active profile** — any changes made via the Monaco editor are saved to the active profile.

---

## Config Editor

The Config page (`/config`) provides in-browser editing of pipeline files and reference documentation.

### Profile editor

At the top of the Config page, a **Profile selector** bar allows you to:
- Switch between profiles
- Create new profiles
- Upload and delete profiles
- Mark a profile as active

**Monaco editor** — the main panel shows a JSON editor (VS Code-like) for the active profile with syntax highlighting and validation.

**Live bullets preview** — the right panel displays all bullets from the active profile with live character count updates:
- Green (<100 chars)
- Amber (100–116 chars)
- Red (>116 chars — exceeds limit)

### Reference documentation

Below the profile editor, four collapsible sections provide read-only reference docs:

| Doc | Purpose |
|---|---|
| `ats-optimization-guidelines.md` | ATS best practices (injected into AI reasoning) |
| `CLAUDE-full.md` | Full resume generation rules |
| `ats-optimized-resume-system.md` | ATS system prompt |
| `spec-job-match-resume-generator.md` | Job match specification |

Each doc displays with a rendered preview panel. No editing; for reference only.

### Backup and restore

A backup/restore UI is preserved for all files. Saves create `.bak` backups automatically.

---

## GitHub Ingestion

The **Import from GitHub** tab on the Chat page fetches a public GitHub repository and uses the AI to generate resume-ready project entries.

### How to use it

1. Paste a full GitHub repository URL (e.g., `https://github.com/user/repo`).
2. Click **Fetch** or press **Enter**.
3. The AI reads the README (up to 6,000 characters) and the top-level file tree to produce:
   - A display name
   - A one-sentence summary
   - A `short_stack` string (3–4 technologies, ≤ 40 chars)
   - 3–5 achievement bullets (≤ 116 chars each)
4. A preview card appears. You can:
   - Edit the project ID (slug used in `master_resume_data.json`)
   - Edit any bullet in place; character counts update live (red when > 116)
5. Click **Add to Profile** to write the entry to the active session's profile data.

A success message confirms the addition. Switch to Chat to further refine the entry or to promote the session.

---

## Sessions

Sessions are named snapshots of your resume profile data (`master_resume_data.json`). They let you maintain multiple variants of your profile — for example, one tuned for systems roles and one for GenAI roles.

| Action | How |
|---|---|
| Create | Click **+ New session** in the Chat sidebar, or use the SessionSwitcher on the Jobs page |
| Switch | Click a session name in the Chat sidebar or use the SessionSwitcher dropdown |
| Rename | Use the PATCH endpoint via SessionSwitcher |
| Delete | Available for all sessions except the Default session |
| Promote | Copies this session's profile data into the Default session; all future generations will use the promoted data |

The Default session is always present and cannot be renamed or deleted. It is the session used when no session is explicitly selected.

---

## Settings

The Settings page (`/settings`) has two sections: folder paths and AI provider configuration.

### Folder paths

Two folder paths control where the pipeline reads and writes files.

**Job Postings Folder** — the directory containing your `.md` job description files. The Scan operation reads from this folder.

**Resume Output Folder** — where generated `.docx` and `.pdf` files are saved. The folder is created automatically on the first successful build if it does not exist.

Use the **Browse** button to navigate the filesystem and select a folder. You can also create a new folder from the browser panel. Click **Use this folder** to save the selection.

The status panel at the bottom of the page shows whether each folder path currently exists on disk. Output folder shows a warning instead of an error if it does not yet exist.

> In Docker deployments, use container-side paths (e.g., `/jobs`, `/output`). Paths are stored in the database and override `.env.local` values.

### AI Provider

Choose which AI **CLI** (or local endpoint) acts as the generation brain. There are **no API keys** — ResumeLoop shells out to a tool you already have, through the provider adapter (`lib/providers/`).

**Pick a provider:**

1. Onboarding detects installed CLIs (`which claude codex gemini opencode`). Pick one from the list.
2. For a local model, choose the `http` transport and point it at an OpenAI-compatible endpoint (e.g. Ollama's Base URL).
3. Click **Test & Save** — the app runs a small validation call (Claude via `--output-format json`; others via the fenced-JSON + retry contract) to confirm the provider responds before saving.

Claude Code gets a native JSON fast-path; every other provider is first-class via the universal fenced-JSON adapter. No provider stores a secret on disk.

### Firecrawl API Key

An optional API key for [Firecrawl](https://firecrawl.dev) — a web scraping service that handles JavaScript-rendered pages. Used by the URL ingestion source in onboarding.

Enter a key starting with `fc-` and click **Save**. Without a key, URL ingestion uses a plain `fetch` + HTML-stripping fallback that works for most static sites. See [`docs/ingest.md`](ingest.md) for details.

