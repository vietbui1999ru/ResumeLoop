---
id: 2026-04-03-job-match-resume-generator-spec
version: "1.0"
status: draft
tags:
  - spec
  - system-design
---

# Job Match Resume Generator — System Spec Sheet

> High-level application spec for implementing the Obsidian-to-Resume workflow as a standalone app.
> Derived from: `master_resume_data.json` (v2.3), `buildv2.js` (v2.3), `7. CLAUDE.md`, ATS guidelines, and ~290 real JD files.

---

## 1. System Overview

**Purpose:** Automatically generate ATS-optimized, 1-page DOCX resumes (and cover letters) tailored to individual job descriptions, using a pre-validated candidate profile as the source of truth.

**One-sentence pitch:** Paste a JD, get a tailored resume DOCX in seconds — bullets selected, keywords matched, fit scored, all within ATS constraints.

### 1.1 Core Workflow (Pipeline)

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐    ┌────────────┐
│  JD Input    │───▶│  JD Parser   │───▶│  Match Engine │───▶│  DOCX Builder│───▶│  Output    │
│  (markdown)  │    │  + Visa Gate │    │  + ATS Scorer │    │  (buildv2)   │    │  + Tagging │
└─────────────┘    └──────────────┘    └───────────────┘    └──────────────┘    └────────────┘
       │                  │                    │                    │                   │
       ▼                  ▼                    ▼                    ▼                   ▼
  Obsidian .md       Structured JD       data.json blob       .docx file        JD file tagged
  with frontmatter   + kill/proceed      for buildv2.js       to output dir     resume-ed
```

### 1.2 Supported Output Types

| Output        | Template Source                                      | Format |
|---------------|------------------------------------------------------|--------|
| Resume        | Jake's Calibri A4 Resume (`3. TECH-...docx`)         | DOCX   |
| Cover Letter  | Jake's Calibri A4 Cover Letter (`1. GENERAL-...docx`)| DOCX   |

---

## 2. Data Architecture

### 2.1 Canonical Data Sources (Single Source of Truth)

All canonical files live in `References/Jobs/`. The Gemini `Attachments/Agents/.../references/` folder is a **stale snapshot** — do not read from it at runtime.

| File | Role | Version | Format |
|------|------|---------|--------|
| `master_resume_data.json` | Candidate profile — all bullets, projects, skills, contact | v2.3 | JSON |
| `buildv2.js` | DOCX generation engine (paragraph layout, validators) | v2.3 | Node.js |
| `7. CLAUDE.md` | Agent instructions, rules, constraints, role-track picks | v2.3 | Markdown |
| `6. ats_optimization_guidelines.md` | ATS rules checklist (13 rules) | v2.0 | Markdown |
| `5. ats-optimized-resume-system.md` | System architecture & strategy doc | v2.2 | Markdown |
| `8. I spent 8 months testing...md` | ATS research findings (source material) | — | Markdown |
| `1. GENERAL-Jakes-Cover-Letter-Template-Calibri-A4.docx` | Cover letter DOCX template | — | DOCX |
| `3. TECH-Jakes-Resume-Template-Calibri-A4.docx` | Resume DOCX template (layout reference) | — | DOCX |

### 2.2 ATS Keyword Banks (Reference)

Moved from Gemini refs — merge into app as static lookup:

| File | Track |
|------|-------|
| `ats_keywords_aiml.md` | AI/ML roles (~28 keywords) |
| `ats_keywords_data_engineer.md` | Data Engineering (~34 keywords) |
| `ats_keywords_fullstack.md` | Full-Stack (~40 keywords) |
| `ats_keywords_sre_devops.md` | SRE/DevOps (~36 keywords) |

### 2.3 Input: JD Files (~290 in corpus)

**Format:** Obsidian markdown with YAML frontmatter.

```yaml
---
created: 2026-03-29
title: "AI Agent Developer"
Company: "Fortinet"
Action: "1-Applied"
source: "https://..."
Resume:                    # ← populated after generation
tags:
  - clippings
  - jobs
  - un-resume              # ← flipped to 'resume-ed' after generation
outreach:
notes:
---
# Summary
...
# Raw content
## Job Description
...
## Required Qualifications
...
## Preferred Qualifications
...
```

**Tag lifecycle:**
- `un-resume` → file needs a resume generated
- `resume-ed` → resume already generated (skip on future scans)
- `un-cover-letter` → needs cover letter generation

---

## 3. Module Spec

### 3.1 JD Parser

**Input:** Raw markdown file (frontmatter + body)
**Output:** Structured JD object

```typescript
interface ParsedJD {
  title: string;           // exact job title from posting
  company: string;
  source: string;          // application URL
  tags: string[];
  description: string;     // full JD text
  requirements: {
    required: string[];
    preferred: string[];
  };
  keywords: string[];      // extracted tech keywords
  visaStatus: 'proceed' | 'kill';  // visa gate result
  roleTrack: string;       // matched track: "AI/LLM/Agents" | "Full-Stack" | etc.
}
```

**Visa Gate Rules:**
| JD Language | Action |
|-------------|--------|
| "US Citizen/GC only" or explicit "no sponsorship" | `kill` — do not generate |
| "authorized to work in US" | `proceed` — OPT/STEM OPT qualifies |
| Standard EEO / no mention | `proceed` |
| "Will sponsor" | `proceed` |

### 3.2 Match Engine

**Input:** `ParsedJD` + `master_resume_data.json`
**Output:** Resume data blob ready for buildv2

**Responsibilities:**

1. **Role Track Classification** — Map JD to one of 17 role tracks:
   ```
   AI/LLM/Agents | .NET/Full-Stack | Embedded/Systems | Distributed/Infra |
   Data/ML | Automation/Finance | Quant/Numerical | Rust/Systems |
   Frontend/Product | AI Tooling/DevTools | GenAI/Python | SRE/DevOps |
   IT/Helpdesk/Support | QA/Testing | Game Dev | Data Analyst |
   Technical Support/DevRel
   ```

2. **Work Experience Selection** — Pick 2-3 work entries from `WORK_META` IDs:
   - `gitlab` — Open Source Contributor @ GitLab/CodePath
   - `carboncopies` — Complex Systems Research Engineer @ Carboncopies Foundation
   - `udayton` — Graduate Research Assistant @ University of Dayton
   - `augustana` — Research Assistant & Peer Tutor @ Augustana College

3. **Bullet Variant Selection** — Each work entry has bullet variants:
   - `fullstack` | `genai` | `sre` | `systems`
   - Pick variant closest to target role track

4. **Project Selection** — Pick 2-3 projects from `role_track_picks` mapping (16 projects available)

5. **Skill Set Selection** — Pick from 5 pre-built skill sets:
   - `fullstack` | `genai` | `sre_devops` | `systems` | `data_ml`

6. **Tagline Generation** — Build from templates:
   - Hard limit: **76 chars WITH spaces**
   - Must contain **exact job title** from JD
   - Value-oriented, not generic list
   - Format: `{Job Title} building {what} with {tech1} and {tech2}` or `{Job Title} — {differentiator}`

7. **Keyword Scoring** — Count JD keywords matched in generated content:
   - Target: 25-35 unique keywords
   - Cross-reference against `ats_keywords_*.md` banks

8. **Fit Percentage** — Calculate and report:
   - % of required skills matched
   - % of preferred skills matched
   - Flag missing tools/domain gaps (especially for CS-adjacent roles)

### 3.3 Validator

**Hard constraints (reject if violated):**

| Constraint | Limit | Enforced by |
|------------|-------|-------------|
| Bullet length | ≤116 chars WITH spaces | `T()` in buildv2.js |
| Tagline length | ≤76 chars WITH spaces | `TL()` in buildv2.js |
| Project header length | ≤116 chars (`name + ' \| ' + short_stack + '  GitHub  ' + date`) | `ph()` in buildv2.js |
| No professional summary | boolean | Pre-gen checklist |
| No "new grad" language | regex scan | Pre-gen checklist |
| Action verb uniqueness | no two bullets start with same verb | Post-gen check |
| Impact requirement | every bullet must name ≥1 tool + ≥1 result | Post-gen check |
| Keyword density | 25-35 unique JD keywords | Post-gen count |
| 1-page fit | dynamic para count ≤ ~44 | Para formula |

**Soft constraints (warn):**
- Activity-only bullets ("Collaborated with...", "Participated in...", "Assisted with...")
- Missing business context (at least 1 bullet per work entry should explain *why*)
- EthSwitch selected for non-Systems role
- Research conflation (KSE 2024 vs Coq/Rocq — two distinct works)

### 3.4 DOCX Builder

**Input:** Validated resume data blob
**Output:** `.docx` file

**Layout spec (from buildv2.js):**

| Property | Value |
|----------|-------|
| Font | Calibri |
| Body size | 11pt (22 half-pts) |
| Name size | 28pt |
| Section header size | 12pt |
| Tagline size | 12pt |
| Page | US Letter (12240 x 15840 twips) |
| Margins | 0.45" all sides (648 twips) |
| Line spacing | 252 twips |
| Bullet symbol | • (U+2022) |
| Bullet indent | 180 twips left, 180 hanging |
| Contact row | Centered, shaded #F1F1F5, 11pt |
| Section borders | Bottom single line |

**Data shape (v2.3):**
```typescript
interface ResumeData {
  file: string;              // output filename (no extension)
  tagline: string;           // ≤76 chars
  work: WorkEntry[];         // 2-3 entries
  projects: ProjectEntry[];  // 2-3 entries
  skills: SkillRow[];        // exactly 5 rows
}

interface WorkEntry {
  id: 'gitlab' | 'carboncopies' | 'udayton' | 'augustana';
  bullets: string[];         // each ≤116 chars
}

interface ProjectEntry {
  name: string;
  url?: string;              // GitHub URL → hyperlinked "GitHub" text
  stack: string;             // short_stack: 3-4 techs, ≤40 chars
  date: string;              // "Mon. YYYY -- Mon. YYYY" or "Mon. YYYY -- Present"
  bullets: string[];         // each ≤116 chars
}

interface SkillRow {
  label: string;             // e.g. "Languages", "Frameworks"
  vals: string;              // comma-separated values
}
```

**Paragraph count formula (dynamic):**
```
header:   3  (name + contact + tagline)
education: 3  (section header + 2 school lines)
work:     1 + N × (1 + B_w)   (section header + N jobs × (title line + B_w bullets))
projects: 1 + P × (1 + B_p)   (section header + P projects × (header + B_p bullets))
skills:   1 + 5                (section header + 5 rows)
```

| Layout | Para Count | Fits 1 page? |
|--------|-----------|--------------|
| 2 jobs × 5b + 3 proj × 3b | 38 | Yes |
| 3 jobs × 5b + 3 proj × 3b | 44 | Probably |
| 3 jobs × 5b + 3 proj × 4b | 47 | Likely 2-page |

**Static content (hardcoded in builder):**

| Section | Content |
|---------|---------|
| Name | Quoc-Viet Bui |
| Contact | 309 631 4531 \| buiquocviet99@gmail.com \| [LinkedIn](linkedin.com/in/vietbui99) \| [Portfolio](vietbui1999ru.github.io) |
| Education 1 | University of Dayton -- M.S. Computer Science (Aug. 2023 -- Dec. 2025) |
| Education 2 | Augustana College -- B.A. Applied Mathematics & Computer Science (Aug. 2019 -- May 2023) |

### 3.5 Cover Letter Builder

**Template:** `1. GENERAL-Jakes-Cover-Letter-Template-Calibri-A4.docx` (45KB, Calibri A4)

**Input:** `ParsedJD` + candidate profile
**Output:** `.docx` cover letter

**Content structure (standard 3-paragraph format):**
1. Opening: Position + company + why interested
2. Body: 2-3 relevant accomplishments mapped from profile to JD requirements
3. Closing: Call to action + availability

**Constraints:** Same font/layout as resume template. No professional summary rehash. Match the tone to the JD (startup vs enterprise).

### 3.6 Post-Generation Tagger

After successful DOCX output, update the source JD markdown file:
- Remove `un-resume` from `tags:` block
- Add `resume-ed` to `tags:` block
- Populate the `Resume:` frontmatter field with the output filename

---

## 4. Section Format Rules (ATS Compliance)

### 4.1 Section Order (fixed)

1. **Name + Tagline** (centered)
2. **Education** (compact: "School -- Degree" per line)
3. **Work Experience** ("Bold Title | Company -- Location    Bold Dates")
4. **Relevant Projects** ("Bold Name | short_stack    GitHub  Date")
5. **Technical Skills** ("Bold Label | comma-separated values")

### 4.2 Section Headers (exact strings)

| Header | Must be exactly |
|--------|-----------------|
| Education | `EDUCATION` |
| Work | `WORK EXPERIENCE` |
| Projects | `RELEVANT PROJECTS` |
| Skills | `TECHNICAL SKILLS` |

### 4.3 Date Format

All dates: `Mon. YYYY` (e.g., "Jan. 2020 -- Mar. 2023"). Never mix formats.

### 4.4 Bullet Formula

```
[Action Verb] [what was built] using [tech], [process/method], [quantified impact]
```

**Action verb pool (no repeats per resume):**
Built, Designed, Engineered, Developed, Automated, Configured, Implemented, Deployed, Wrote, Contributed, Shipped, Optimized, Integrated, Orchestrated, Diagnosed, Collaborated, Analyzed, Scaffolded, Provisioned, Monitored, Scripted, Applied, Containerized, Delivered

### 4.5 Tagline Rules

- Contains **exact** job title from posting
- ≤76 chars WITH spaces
- Value-oriented: `{Title} building {what} with {tech}` or `{Title} -- {differentiator}`
- NOT: generic "experienced in X, Y, Z, and W"

---

## 5. Candidate Profile Summary

| Field | Value |
|-------|-------|
| Name | Quoc-Viet Bui |
| Location | Harrisburg, PA |
| Work Auth | OPT + STEM OPT (up to 3 years) |
| M.S. | Computer Science, University of Dayton (Dec 2025) |
| B.A. | Applied Mathematics + Computer Science, Augustana College (May 2023) |
| Current roles | Open Source Contributor @ GitLab/CodePath; Complex Systems Research Engineer @ Carboncopies Foundation |
| Publications | IEEE KSE 2024 (2nd author); Coq/Rocq draft (1st author) |
| Core stack | Python, TypeScript, Go, Rust, C#, FastAPI, React, Docker, Terraform |
| Projects | 16 portfolio projects across AI, full-stack, systems, embedded, and research |

### 5.1 Research Integrity Rules (Critical)

| Work | Title | Status | Viet's Role |
|------|-------|--------|-------------|
| KSE 2024 | "Imposter Injection" — RL adversarial robustness | **Published** at IEEE KSE 2024 | 2nd author |
| Coq/Rocq | "From Program Graphs to Proofs" — formal verification | **Draft** (unpublished) | 1st author |

**NEVER conflate these.** KSE 2024 is NOT about Coq. The Coq paper is NOT published at KSE 2024.

---

## 6. Role-Track Routing Table

| Track | Projects | Work Entries | Bullet Variant | Skill Set |
|-------|----------|-------------|----------------|-----------|
| AI/LLM/Agents | ObsidianTasks + claude-tui + CalAI | gitlab + carboncopies + udayton | genai | genai |
| .NET/Full-Stack | HomeBoard + MRR Dashboard + SpotiSwipe | gitlab + carboncopies + udayton | fullstack | fullstack |
| Embedded/Systems | ZMK + Jetson + EthSwitch | gitlab + carboncopies + udayton | systems | systems |
| Distributed/Infra | EthSwitch + Homelab + MRR Dashboard | gitlab + carboncopies + udayton | systems | systems |
| Data/ML | CalAI + MRR Dashboard + Maze Solver DRL | gitlab + carboncopies + udayton | genai | data_ml |
| Automation/Finance | MRR Dashboard + HomeBoard + CalAI | gitlab + carboncopies + udayton | fullstack | fullstack |
| Quant/Numerical | PDE Platform + MRR Dashboard + Maze Solver DRL | gitlab + carboncopies + udayton | fullstack | data_ml |
| Rust/Systems | claude-tui + EthSwitch + Homelab | gitlab + carboncopies + udayton | systems | systems |
| Frontend/Product | CalAI + SpotiSwipe + HomeBoard | gitlab + carboncopies + udayton | fullstack | fullstack |
| AI Tooling/DevTools | ObsidianTasks + claude-tui + CalAI | gitlab + carboncopies + udayton | genai | genai |
| GenAI/Python | ObsidianTasks + CalAI + MRR Dashboard | gitlab + carboncopies + udayton | genai | genai |
| SRE/DevOps | Homelab + EthSwitch + claude-tui | gitlab + carboncopies + udayton | sre | sre_devops |
| IT/Helpdesk | Homelab + claude-tui + ZMK | gitlab + udayton + augustana | systems | systems |
| QA/Testing | Jetson + EthSwitch + HomeBoard | gitlab + carboncopies + udayton | systems | systems |
| Game Dev | Maze Solver DRL + PDE Platform + Jetson | gitlab + carboncopies + udayton | genai | genai |
| Data Analyst | MRR Dashboard + PDE Platform + Maze Solver DRL | gitlab + carboncopies + udayton | systems | data_ml |
| Technical Support/DevRel | Homelab + ObsidianTasks + claude-tui | gitlab + carboncopies + udayton | genai | genai |

---

## 7. File Consolidation Map

Files that existed in both `References/Jobs/` and `Attachments/Agents/Gemini/.../references/`. The **Jobs/** version is canonical (newer) for all shared files.

| Canonical (Jobs/) | Stale Copy (Gemini refs/) | Action |
|--------------------|---------------------------|--------|
| `master_resume_data.json` (v2.3, Mar 26) | `master_resume_data.json` (v2.0, Mar 25) | Use Jobs/ — Gemini copy is outdated |
| `7. CLAUDE.md` (v2.3, Mar 28) | `0. CLAUDE.md` (v2.0, Mar 25) | Use Jobs/ — Gemini copy is outdated |
| `5. ats-optimized-resume-system.md` (v2.2) | `2. ats-optimized-resume-system.md` (v2.0) | Use Jobs/ — Gemini copy is outdated |
| `6. ats_optimization_guidelines.md` | `1. ats_optimization_guidelines.md` | Use Jobs/ — Gemini copy has same content |
| `buildv2.js` (v2.3) | *(does not exist)* | Jobs/ only |
| *(keyword files not here)* | `7-10. ats_keywords_*.md` | Move to Jobs/ or embed in app as static data |
| `1. GENERAL-...Cover-Letter...docx` | `5. Jakes-Cover-Letter...docx` | Same file (identical size), Jobs/ naming preferred |
| `3. TECH-...Resume...docx` | `4. TECH-...Resume...docx` | Same file (identical size), Jobs/ naming preferred |
| *(not present)* | `6. master_resume_fixed.docx` | Legacy artifact, superseded by JSON data |
| *(not present)* | `11. ats_optimization_guidelines.md` | Redirect stub — delete |
| *(not present)* | `small_niche_fixes_in_formatting...docx` | Patch notes — archive or delete |
| *(not present)* | `RocqSoftware...ResearchPaperDraft.pdf` | Research paper — keep as reference if needed |

---

## 8. App Architecture (Implementation Blueprint)

### 8.1 Recommended Stack

| Layer | Tech | Rationale |
|-------|------|-----------|
| Runtime | Node.js (already using `docx` npm package in buildv2.js) | Keep existing engine |
| LLM | Claude API or local LLM | JD parsing, keyword extraction, tagline generation |
| Storage | Filesystem (Obsidian vault) | JD files are markdown on disk |
| Output | `docx` npm package | Already proven in buildv2.js |
| UI (optional) | React Flow (ObsidianTasks style) or CLI | Visual pipeline or batch CLI |

### 8.2 Module Dependency Graph

```
                    ┌──────────────────┐
                    │  master_resume   │
                    │  _data.json      │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
  ┌─────────┐      │                  │      ┌──────────────┐
  │ JD File │─────▶│   Match Engine   │─────▶│  Validator    │
  │ (.md)   │      │                  │      │              │
  └─────────┘      └────────┬─────────┘      └──────┬───────┘
       │                    │                        │
       │           ┌────────▼─────────┐     ┌───────▼───────┐
       │           │ ATS Keyword Banks│     │  DOCX Builder │
       │           └──────────────────┘     │  (buildv2.js) │
       │                                    └───────┬───────┘
       │                                            │
       ▼                                            ▼
  Post-gen Tagger                            Output .docx
  (un-resume → resume-ed)                    + fit report
```

### 8.3 CLI Interface (Minimum Viable)

```bash
# Single JD
resume-gen build "AI Agent Developer.md"
# → Outputs: Fortinet_AIAgentDeveloper_QuocVietBui.docx
# → Prints: Fit: 82% | Track: AI/LLM/Agents | Keywords: 29/35 | Paras: 44

# Batch: all un-resume tagged files
resume-gen batch --tag un-resume
# → Processes all JDs with un-resume tag, skips resume-ed

# Cover letter
resume-gen cover "AI Agent Developer.md"
# → Outputs: Fortinet_AIAgentDeveloper_CoverLetter.docx

# Validate only (no output)
resume-gen validate "AI Agent Developer.md"
# → Prints constraint violations without generating
```

### 8.4 Output Naming Convention

```
{Company}_{JobTitle}_{CandidateName}.docx
```
Example: `Fortinet_AIAgentDeveloper_QuocVietBui.docx`

---

## 9. Error Handling

| Error | Action |
|-------|--------|
| Visa kill detected | Log reason, skip file, do not generate |
| Bullet > 116 chars | Reject build, print offending bullet |
| Tagline > 76 chars | Reject build, print offending tagline |
| Project header > 116 chars | Reject build, print offending header |
| Para count > 47 | Warn: likely 2-page, suggest reducing bullets |
| Duplicate action verb | Warn post-gen, suggest replacements |
| < 25 JD keywords matched | Warn: low ATS match, suggest additions |
| Research conflation detected | Hard error: KSE 2024 and Coq must never be mixed |
| Stack fabrication | Hard error: all tech must exist in project ground truth |
| Tag already `resume-ed` | Skip file silently |

---

## 10. Testing Strategy

| Test | Input | Expected |
|------|-------|----------|
| Visa kill | JD with "US Citizen only" | No output, kill logged |
| Visa proceed | JD with "authorized to work in US" | Resume generated |
| Bullet overflow | Bullet at 117 chars | Build rejected with error |
| Tagline overflow | Tagline at 77 chars | Build rejected with error |
| Happy path (AI role) | AI Agent Developer JD | 44-para DOCX, genai variant, 25+ keywords |
| Happy path (SRE role) | SRE JD | 44-para DOCX, sre variant, SRE keyword bank |
| Tag mutation | File with `un-resume` | Tag flipped to `resume-ed` after success |
| Batch mode | 5 files (3 un-resume, 2 resume-ed) | 3 DOCXs generated, 2 skipped |
| Research guard | Tagline mentions "KSE 2024" + "Coq" | Hard error: conflation detected |

---

## 11. Future Extensions

- **LLM-powered bullet rewriting** — Generate new variant bullets on-the-fly instead of selecting from pre-validated pool
- **Real-time keyword heatmap** — Highlight which JD keywords are/aren't covered
- **Obsidian plugin** — Run pipeline directly from within Obsidian via command palette
- **Cover letter personalization** — Pull company research from JD source URL
- **Batch analytics dashboard** — Track application funnel: generated → applied → callback → interview
- **A/B testing** — Generate 2 variants per JD, track which gets more callbacks
