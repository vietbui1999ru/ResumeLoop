# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

Resume + outreach automation for Quoc-Viet Bui. Given a job description (JD) markdown file, produce a tailored ATS-optimized 1-page DOCX resume, fit assessment, and outreach drafts.

## Build Commands

```bash
# Session init (run every time before building)
mkdir -p batch-build
cp master_resume_data.json batch-build/ && echo "✓ data synced"
cp buildv2.js batch-build/ && echo "✓ buildv2 synced"
cd batch-build && [ ! -d node_modules ] && npm install

# Run a generated build script
cd batch-build && node <generated-script>.js

# Verify output
ls batch-build/*.docx
```

## Per-JD Workflow

1. **Visa check** — "US Citizen/GC only" or explicit "no sponsorship" → STOP + tag JD `visa-kill`. Export control "US person" → STOP. "Authorized to work in US" → proceed (OPT/STEM OPT qualifies). Standard EEO → proceed.
2. **Map role → role-track table** (see below) → select work variant (genai/systems/IT-track)
3. **Select** 3 projects (3 bullets each) + 3 work IDs (5 bullets each)
4. **Draft tagline** ≤76 chars — validate character count
5. **Generate** build script using EXACT bullets from `master_resume_data.json`
6. **Execute** `node <script>.js` in `batch-build/`
7. **Verify** DOCX exists and is named `VietBui_<Company>_<Role>.docx` — e.g. `VietBui_Novig_AIAutomationEngineer.docx`. Use CamelCase, no spaces. Set `file:` in the build script accordingly.
8. **Tag JD file** — remove `un-resume` tag, add `resume-ed` in frontmatter. Skip already `resume-ed` JDs.
9. **Draft outreach** (LinkedIn + email) using provided contacts + special context
10. **Report** fit %, projects chosen, top 3 outreach angles, next steps

## Hard Limits (non-negotiable)

| Constraint | Limit |
|---|---|
| Tagline | ≤76 chars with spaces |
| Bullet | ≤116 chars with spaces |
| Project header (`name \| short_stack  GitHub  date`) | ≤116 chars |
| Project stack in header | `short_stack` field only (3-4 techs, ≤40 chars) |
| Para count for 1-page fit (default) | 44 (3-job×5b + 3-proj×3b) |
| Skills rows | 5 rows default; QA/DevOps roles may condense to 3 rows (Testing · Infra · Languages) if bullets already surface the omitted techs |
| Output filename | `VietBui_<Company>_<Role>.docx` — CamelCase, no spaces (e.g. `VietBui_Novig_AIAutomationEngineer.docx`) |

**Tagline format** — value-oriented, not generic:
- `{Title} building {what} with {tech1} and {tech2}` — action-oriented
- `{Title} — {differentiator or achievement}` — proof-point-first
- AVOID: "Software Engineer experienced in Python, REST APIs, Go, and Cloud Services"

**Bullet formula**: "Built A doing B using C, which produced D" — impact mandatory, not optional. Every bullet: ≥1 tool/tech + ≥1 result. Activity-only red flags (always rewrite): "Collaborated with...", "Participated in...", "Assisted with...".

**Result-first variant** (preferred for impact roles / QA / DevOps): "Automated {outcome} by building {method} using {tech}" — put the metric/outcome BEFORE the method. E.g. "Automated quality gating for merge requests by configuring GitLab CI/CD with lint, test, and deploy stages."

**Action verb variety**: all 24 bullets across a resume (15 work + 9 project) must start with a unique verb — no repeats. Track the full verb list before writing the script.

**Em-dash ban**: never use `—` (U+2014) inside bullet text. ATS and human reviewers flag it as an AI-writing signal. Use semicolons, commas, or rewrite:
- ❌ `Built a pipeline — reduced latency by 40%`
- ✓ `Built a pipeline; reduced latency by 40%`
- ✓ `Built a pipeline, cutting latency by 40%`

**NO** professional summary section — tagline only. **NO** "new grad" language.

## Architecture

### Data Flow
```
JD markdown → visa check → role-track lookup → bullet selection from JSON
           → build script → node buildv2.js → DOCX output
```

### Key Files
- `master_resume_data.json` — single source of truth. Top-level keys: `experience[]`, `projects[]`, `skills{}` (NOT `work[]`).
- `buildv2.js` — DOCX generation engine. Input: `{id, bullets}` for work and projects — metadata auto-resolved. Skills: `{label, vals}` objects.
- `haiku_generate.js` — automated pipeline (Steps 1–6 via Haiku API). See `docs/reference/OptimizedModel/HAIKU_PIPELINE.md`.
- `batch-build/` — working dir for build execution; copy both files here each session
- `JobData/Jobs/` — JD markdown files with frontmatter tags (`un-resume` → `resume-ed`)

### master_resume_data.json Access Pattern (CRITICAL)
```javascript
const m = require('./master_resume_data.json');

// Work bullets — experience[], NOT work[]
const bullet = m.experience.find(x => x.id === 'gitlab').bullets.genai[0];
//                                                                 ^^^^^ variant: genai|systems|fullstack|sre|IT-track

// Project bullets — flat array (no variant key)
const proj = m.projects.find(x => x.id === 'resumeloop');
// proj.id, proj.name, proj.url, proj.short_stack, proj.dates, proj.bullets[]

// Skills — object keyed by variant
const skills = Object.entries(m.skills.genai).map(([label, vals]) => ({label, vals}));
// m.skills keys: genai | sre_devops | fullstack | systems | data_ml
```

### Build Script Pattern
```javascript
// Always use makeDoc() + Packer.toBuffer() — never call build() directly
const { makeDoc } = require('./buildv2.js');
const { Packer }  = require('docx');
const fs = require('fs'), path = require('path');
const master = require('./master_resume_data.json');

const RESUMES_DIR = '/Users/vietquocbui/repos/resume-gen/Startups/Resumes';

const data = { /* ... */ };
const doc = makeDoc(data);
Packer.toBuffer(doc).then(buf => {
  fs.mkdirSync(RESUMES_DIR, { recursive: true });
  const fp = path.join(RESUMES_DIR, data.file + '.docx');
  fs.writeFileSync(fp, buf);
  console.log('✓ ' + data.file + ' (' + (buf.length / 1024).toFixed(1) + 'KB) → ' + fp);
}).catch(err => { console.error(err); process.exit(1); });
```

Build script header must include verb plan:
```javascript
// VietBui_<Co>_<Role>.js — <Title> @ <Company>
// Fit: XX% — <rationale>
// Track: <track> | Variant: genai
// Tagline: XX chars ✓
//
// Verb plan (all 24 unique):
//   gitlab genai:    Contributed, Built, Configured, Automated, Collaborated
//   carboncopies:    Scaled*, Developed, Streamlined*, Processed*, Debugged
//   udayton genai:   Co-authored, Constructed*, Wrote, Designed, Authored
//   <proj1>:         VerbA, VerbB, VerbC
//   <proj2>:         VerbD, VerbE, VerbF
//   <proj3>:         VerbG, VerbH, VerbI
// * = overrides
```

### buildv2.js Data Shape (v2.3)
Work IDs: `gitlab` | `carboncopies` | `udayton` | `augustana`. WORK_META headers live in buildv2.js. Project IDs resolved from `master_resume_data.json`. Always sync both files to `batch-build/` before running.

## Candidate

- **Name**: Quoc-Viet Bui
- **Email**: buiquocviet99@gmail.com | **Phone**: 309 631 4531
- **Location**: Harrisburg, PA
- **LinkedIn**: linkedin.com/in/vietbui99 | **Portfolio**: vietbui1999ru.github.io (use "Portfolio", not "Website")
- **Education**: M.S. CS, Univ. of Dayton (Dec 2025) | Dual B.A. Applied Math + CS, Augustana College (May 2023)
- **Work auth**: OPT + STEM OPT (up to 3 years total, no H-1B needed yet)
- **Current roles**: Open Source Contributor @ GitLab/CodePath (Feb 2026–) + Complex Systems Research Eng @ Carboncopies (Jul 2025–, **part-time contract**, concurrent with M.S. Dec 2025)
- **Availability**: Immediately available for full-time work (M.S. completed Dec 2025) — ensure LinkedIn reflects this
- **Positioning**: Full-stack SWE — GenAI, Go, distributed systems, Linux; SET/DevOps hybrid framing for QA/infra roles

## Work Track Variants

Work bullet variants in `master_resume_data.json`. Pick based on role:

**genai** (Python/LLM/automation/data/product): gitlab, carboncopies, udayton
**systems** (Go/infra/SRE/backend/embedded/networking): gitlab, carboncopies, udayton
**fullstack** (product engineering, TypeScript/React heavy): gitlab, carboncopies, udayton
**sre** (SRE/DevOps/platform, observability-first): gitlab, carboncopies, udayton → use `sre_devops` skills track
**IT-track** (IT support/helpdesk/sysadmin): gitlab + udayton + **augustana** (NOT carboncopies) — put augustana IT Help Desk bullet FIRST

## Role-Track Project Picks

Project IDs below are lowercase snake_case — use exactly these IDs in build scripts.

### Core SWE
| Track | Projects | Work variant |
|---|---|---|
| Software Engineer / Full-Stack | homeboard + mrr_dashboard + spotiswipe | genai |
| Backend / API Engineer | mrr_dashboard + homeboard + ethswitch | systems |
| Frontend / Product Engineer | resumeloop + spotiswipe + homeboard | fullstack |
| GenAI / AI Engineer | resumeloop + claude_tui + mrr_dashboard | genai |
| AI/LLM/Agents | llm_wiki + resumeloop + claude_tui | genai |
| AI Automation Engineer | resumeloop + pe_hackathon + mrr_dashboard | genai |
| Vibe Coding / AI Dev Tools | llm_wiki + claude_tui + resumeloop | genai |
| ML Engineer | jetson + maze_drl + mrr_dashboard | genai |
| MLOps / Platform Eng | pe_hackathon + homelab + claude_tui | systems |
| .NET / C# Engineer | homeboard + mrr_dashboard + spotiswipe | genai |

### Infrastructure / DevOps / Cloud
| Track | Projects | Work variant |
|---|---|---|
| SRE / DevOps Engineer | pe_hackathon + homelab + claude_tui | sre |
| Cloud Engineer | homelab + pe_hackathon + mrr_dashboard | systems |
| Platform Engineer | homelab + pe_hackathon + claude_tui | systems |
| Network Engineer | ethswitch + homelab + claude_tui | systems |
| Distributed Systems Eng | ethswitch + homelab + mrr_dashboard | systems |
| Rust / Systems Programmer | claude_tui + ethswitch + homelab | systems |

### Data
| Track | Projects | Work variant |
|---|---|---|
| Data Analyst | mrr_dashboard + pde_platform + maze_drl | genai |
| Data Engineer | resumeloop + mrr_dashboard + spotiswipe | genai |
| Quant / Numerical Methods | pde_platform + mrr_dashboard + maze_drl | genai |

### QA / Testing
| Track | Projects | Work variant |
|---|---|---|
| QA Analyst / SQA Engineer | pe_hackathon + price_monitor + resume_analyze | sre |
| Test Automation Engineer | pe_hackathon + price_monitor + resume_analyze | sre |
| SDET / SET (Software Engineer in Test) | pe_hackathon + price_monitor + resume_analyze | sre |

### Security
| Track | Projects | Work variant |
|---|---|---|
| Information Security Analyst | homelab + ethswitch + coq_verification | systems |
| Network Security Engineer | ethswitch + homelab + coq_verification | systems |
| Risk Management / Compliance | coq_verification + mrr_dashboard + homeboard | genai |

### Support / Embedded / Other
| Track | Projects | Work variant |
|---|---|---|
| IT Support / Helpdesk | homelab + claude_tui + zmk | IT-track |
| System Administrator | homelab + claude_tui + ethswitch | systems |
| Forward Deployed Engineer | resumeloop + mrr_dashboard + homeboard | genai |
| Embedded Systems Engineer | zmk + jetson + ethswitch | systems |

## Project Stack Ground Truth

| Project | Stack |
|---|---|
| MRR Dashboard | FastAPI, React, Recharts, BigQuery, Python, Stripe API |
| HomeBoard | ASP.NET Core 8, C#, React, TypeScript, PostgreSQL, Redis, Docker, xUnit, Testcontainers |
| SpotiSwipe | Next.js, React, TypeScript, tRPC, Prisma, PostgreSQL, OAuth 2.0, Docker |
| ~~CalAI~~ | ~~Next.js, LangChain, Gemini AI, Google Calendar API, OAuth 2.0, Zod~~ — **RETIRED** (backup in master_resume_data.json `retired_projects`) |
| PDE Platform | FastAPI, React, TypeScript, Plotly.js, NumPy, Docker, Nginx |
| EthSwitch | Go, IEEE 802.3, Goroutines, Channels, CRC32 |
| Maze Solver DRL | Python, PyTorch, Deep Q-Network (DQN), NumPy |
| Homelab | Proxmox, Prometheus, Grafana, Terraform, Ansible, WireGuard, Docker, k8s, VLAN, dual-NIC, 3 bare-metal servers |
| ZMK | ZMK, nRF52840, Devicetree, BLE HID, GitHub Actions |
| Jetson | NVIDIA Jetson, CUDA, PyTorch, MIPI CSI-2, Python |
| pe_hackathon | Flask, Peewee ORM, PostgreSQL, Redis, Nginx, Gunicorn, Prometheus, Grafana, Alertmanager, Docker, GitHub Actions, pytest, k6 |
| claude_tui | Rust, tokio, ratatui, SQLite WAL, JSON-RPC 2.0, Unix Domain Sockets |
| ~~ObsidianTasks~~ | ~~TypeScript, React Flow, Node.js, Claude API, MCP~~ — **RETIRED** (backup in master_resume_data.json `retired_projects`) |
| price_monitor | Playwright, playwright-stealth, Python, FastAPI, PostgreSQL 16, asyncio, SQLAlchemy 2.0, Alembic, Redis, Docker, pytest, GitHub Actions |
| resumeloop | Next.js 14, TypeScript, Vercel AI SDK, NextAuth v5, SQLite/Neon Postgres (DbAdapter), AWS ECS Fargate, ALB, GitHub Actions, LibreOffice |
| resume_analyze | Next.js 14, TypeScript, Vercel AI SDK, SQLite, Neon Postgres, NextAuth v5, Claude API, GitHub Actions, Docker, Zod |
| LLM-Wiki | Claude Code, Git, POSIX mv, git refs/tasks/* branch races, JSONL event log, JSON-RPC, Hooks, Skills, multi-agent systems |

## Work Experience Tech Ground Truth

- **GitLab/CodePath** (Feb 2026–): Ruby, Go, Git, Ansible, Terraform, GitLab CI/CD, LLMs, open-source
- **Carboncopies** (Jul 2025–): Python, FastAPI, React, Docker, GitHub Actions, Prometheus, Proxmox, BrainGenix, biophysical neuron simulation, CI/CD, ETL
- **University of Dayton** (Aug 2023–Aug 2025): Rocq/Coq, Python, PyTorch, TypeScript, Go, MATLAB, NuSMV, CUDA, formal verification, RL, IEEE KSE 2024 (2nd author), teaching assistant
- **Augustana College** (Aug 2020–May 2023): Python, MATLAB, elliptic integrals (Beling Scholar), 300+ students tutored, Data Structures, IT Help Desk, hardware diagnostics, network config

## Research Works — Never Conflate

| Paper | Title | Topic | Viet's role | Status |
|---|---|---|---|---|
| KSE 2024 | "Imposter Injection" | RL adversarial robustness, entropy-based feature selection | **2nd author** | Published |
| Coq/Rocq | "From Program Graphs to Proofs" | Formal security verification via Program Graphs + Transition Systems | **1st author** | Draft (NOT published at KSE 2024) |

## Role Framing by Track

**QA / SET / DevOps hybrid**: Frame as "the engineer who lets the rest of the team ship faster without breaking things." Lead bullets with outcomes (0% error rate, 60% QA reduction, blocked bad deploys). Never frame as a pure tester — always show full-stack build capability alongside the QA signal.

**Seed-stage AI companies** (≤30 engineers): Prioritize `resumeloop` or `resume_analyze` — both prove end-to-end AI product ownership. Generalist signal > specialist signal at this stage.

**Growth-stage startups**: Lead with the two headline metrics — "eliminating 60% of manual QA" (carboncopies) and "0% error rate at 500 VUs" (pe_hackathon). These are the numbers founders remember.

**Open-source-first companies**: Lead the GitLab section with the contribution bullet and make it as specific as possible. If a particular PR area is known (pipeline config, Ruby bug fixes), name it. Vague OSS claims discount; specific merged PRs compound.

## ATS Keyword Bank by Track

### QA / SDET / Test Automation
`Software Engineer in Test` · `SDET` · `shift-left testing` · `quality gating` · `CI/CD quality gates` · `test automation` · `test coverage` · `pytest` · `Playwright` · `k6` · `xUnit` · `Testcontainers` · `merge request validation` · `regression testing` · `end-to-end testing` · `integration testing` · `test-driven development`

### DevOps / SRE / Platform
`infrastructure as code` · `IaC` · `Terraform` · `Ansible` · `GitLab CI/CD` · `GitHub Actions` · `observability` · `four golden signals` · `Prometheus` · `Grafana` · `Alertmanager` · `MTTR` · `SLO` · `incident response` · `deployment validation` · `reproducible deployments` · `Docker Compose` · `Kubernetes`

### AI Automation / LLM Engineering
`LLM validation` · `agent orchestration` · `AI-assisted workflows` · `autonomous development` · `multi-provider LLM` · `Vercel AI SDK` · `Zod schema validation` · `prompt engineering` · `MCP` · `Claude API` · `AI quality assurance` · `AI safety` · `output guardrails` · `fit scoring` · `CI/CD for AI`

### GenAI / Full-Stack AI
`LangChain` · `RAG` · `agentic workflow` · `multi-modal` · `structured output` · `vector retrieval` · `Gemini AI` · `Anthropic Claude` · `OpenAI` · `AI product` · `AI pipeline` · `LLM integration` · `AI tooling`

### Systems / Distributed / Rust
`distributed systems` · `concurrent programming` · `Rust` · `Tokio` · `goroutines` · `channels` · `lock-free` · `SQLite WAL` · `JSON-RPC` · `Unix sockets` · `bare-metal` · `Proxmox` · `VLAN` · `race detector` · `async runtime` · `IEEE 802.3` · `formal verification`

## Key Errors to Avoid

| Error | Correct approach |
|---|---|
| `m.work.find(...)` | `m.experience.find(...)` — top-level key is `experience`, not `work` |
| `m.experience.find(...).bullets` (flat access) | `m.experience.find(...).bullets.genai` — bullets is `{variant: []}` object |
| `data.skills = ['string · string']` | `data.skills = [{label, vals}]` — never plain strings |
| Passing `{name, url, stack, date, bullets}` to project | Pass `{id, bullets}` only — metadata auto-resolved by buildv2.js |
| `Object.entries(master.skills.genai)` for SRE roles | Use `master.skills.sre_devops` for SRE/DevOps/Platform roles |
| `master.skills.genai` as-is | `Object.entries(master.skills.genai).map(([label, vals]) => ({label, vals}))` |
| MRR Dashboard → C# | MRR Dashboard is Python/FastAPI. HomeBoard is C#/ASP.NET |
| EthSwitch in product roles | EthSwitch only for Systems/Go/Networking roles |
| `resumeloop` in QA tracks | QA tracks use `resume_analyze`, not `resumeloop` |
| Em-dash `—` inside bullet text | Use semicolon or comma — em-dashes are flagged as AI-writing signal |
| Two bullets sharing starting verb | Track all 24 starting verbs; apply overrides proactively (see Verb Conflict Map) |
| Missing verb plan in script header | Always document all 24 verbs + overrides in script comment header |
| Skipping char count | Count every tagline and every overridden bullet before writing the script |
| `'tagline'.length` estimation | Use `'your tagline'.length` in JS console — 76 is hard ceiling |
| Low fit → no resume | Always generate, state fit %, flag missing tools. Let Viet decide. |
| Carboncopies overlap | Carboncopies = part-time contract concurrent with M.S. — flag if JD asks about availability |
| GitLab lead bullet generic | Avoid "Configured GitLab CI/CD pipelines" as lead — result-first, name specific feature area |
| Skills category redundancy | Do NOT list a skill category if every tech in it is already in bullets — wastes vertical space |

## Verb Conflict Map — genai work track

Standard starting verbs per bullet position. Conflicts marked ⚠. Apply overrides every time.

```
gitlab genai:
  b0: Contributed
  b1: Built          ⚠ LOCKED — forces overrides downstream
  b2: Configured
  b3: Automated      ⚠ LOCKED
  b4: Collaborated

carboncopies genai (conflicts with gitlab):
  b0: Built          ⚠ → "Scaled"         (60% throughput metric preserved)
  b1: Developed
  b2: Automated      ⚠ → "Streamlined"
  b3: Built          ⚠ → "Processed"
  b4: Debugged

udayton genai (conflicts with gitlab):
  b0: Co-authored
  b1: Built          ⚠ → "Constructed"    (Coq framework bullet)
  b2: Wrote          LOCKED
  b3: Designed       ⚠ LOCKED — conflicts with homeboard b0
  b4: Authored
```

**Standard overrides for genai 3-job track (apply every time):**
- `carboncopies b0`: → "Scaled neuron simulation throughput 60% by refactoring Python analysis pipelines using FastAPI and Docker"
- `carboncopies b2`: → "Streamlined data ETL in Python + Docker, enabling reproducible simulation runs and consistent quality"
- `carboncopies b3`: → "Processed biophysical neuron simulation data via Python analysis pipelines for computational neuroscience research"
- `udayton b1`: → "Constructed Coq framework translating Program Graphs to safety proofs; detected overflow and injection attacks"

**Project bullet overrides (apply when conflict with work verbs):**

| Project | Bullet | Default verb | Override |
|---|---|---|---|
| mrr_dashboard | b0 | Built | "Piped" |
| mrr_dashboard | b1 | Designed | "Wired" or "Served" (Designed locked by udayton b3) |
| mrr_dashboard | b3 | Built | "Visualized" or "Engineered" |
| claude_tui | b0 | Built | "Architected" |
| claude_tui | b1 | Built | "Implemented" or "Wired" |
| claude_tui | b4 | Built | "Reconstructed" |
| homeboard | b0 | Designed | "Architected" (Designed locked by udayton b3) |
| pe_hackathon | b0 | Built | "Scaled" (only if carboncopies not in use) |
| llm_wiki | b1 | Built | "Engineered" |

**Verb pool for overrides**: Architected · Containerized · Engineered · Exposed · Hardened · Implemented · Instrumented · Launched · Mapped · Piped · Processed · Reconstructed · Scaled · Served · Shipped · Specced · Streamlined · Visualized · Wired

## Feedback Loop

After each resume generation, if Viet flags issues or requests changes:

1. **Rate (optional)** — prefix message with `rate: X/3` (1=bad, 2=ok, 3=good)
2. **I apply the fix**, then invoke `capture-mistake` → appends structured entry to `feedback/raw-log.md`
3. **Synthesize** — when `feedback/raw-log.md` has ≥5 entries, or on demand ("synthesize feedback"), invoke `synthesize-mistakes` → distills patterns into "Key Errors to Avoid" below

Trigger phrases:
- `"synthesize feedback"` → run `synthesize-mistakes` on `feedback/raw-log.md`
- `"rate: X/3 — <note>"` → I log it even if no code change needed

`feedback/raw-log.md` — running log of all issues + fixes across JDs.

## Agent skills

### Issue tracker
GitHub — `github.com/vietbui1999ru/ResumeLoop`. See `docs/agents/issue-tracker.md`.

### Triage labels
Standard five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs
Single-context — `CONTEXT.md` at root + `docs/adr/` for architecture decisions. See `docs/agents/domain.md`.
