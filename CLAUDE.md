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

**Action verb variety**: no two bullets in one resume start with the same verb.

**NO** professional summary section — tagline only. **NO** "new grad" language.

## Architecture

### Data Flow
```
JD markdown → visa check → role-track lookup → bullet selection from JSON
           → build script → node buildv2.js → DOCX output
```

### Key Files
- `master_resume_data.json` — single source of truth for all bullets. `data.work = [{id, bullets[]}]`, `data.projects = [{id, bullets[]}]`, `data.skills = {track: {Label: "vals", ...}}`
- `buildv2.js` — DOCX generation engine. Work input: `{id, bullets}` — metadata auto-resolved from WORK_META. Project input: `{id, bullets}` — metadata auto-resolved from JSON. Skills: `{label, vals}` objects rendered with bold labels via `sl()`.
- `haiku_generate.js` — automated pipeline (Steps 1–6 via Haiku API). See `pipeline/HAIKU_PIPELINE.md`.
- `batch-build/` — working dir for build execution; copy both files here each session
- `JobData/Jobs/` — JD markdown files with frontmatter tags (`un-resume` → `resume-ed`)

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

Two bullet tracks per employer. Pick based on role:

**genai** (Python/LLM/automation/data/product): gitlab, carboncopies, udayton
**systems** (Go/infra/SRE/backend/embedded/networking): gitlab, carboncopies, udayton
**fullstack** (product engineering, TypeScript/React heavy): gitlab, carboncopies, udayton
**sre** (SRE/DevOps/platform, observability-first): gitlab, carboncopies, udayton
**IT-track** (IT support/helpdesk/sysadmin): gitlab + udayton + **augustana** (NOT carboncopies) — put augustana IT Help Desk bullet FIRST

## Role-Track Project Picks

### Core SWE
| Track | Projects | Work variant |
|---|---|---|
| Software Engineer / Full-Stack | HomeBoard + MRR Dashboard + SpotiSwipe | fullstack |
| Backend / API Engineer | MRR Dashboard + HomeBoard + EthSwitch | systems |
| Frontend / Product Engineer | resumeloop + SpotiSwipe + HomeBoard | fullstack |
| GenAI / AI Engineer | resumeloop + claude_tui + mrr_dashboard | genai |
| AI/LLM/Agents | llm_wiki + resumeloop + claude_tui | genai |
| AI Automation Engineer | resumeloop + pe_hackathon + mrr_dashboard | genai |
| Vibe Coding / AI Dev Tools | llm_wiki + claude_tui + resumeloop | genai |
| ML Engineer | Jetson + maze_drl + MRR Dashboard | genai |
| MLOps / Platform Eng | pe_hackathon + Homelab + claude-tui | systems |
| .NET / C# Engineer | HomeBoard + MRR Dashboard + SpotiSwipe | fullstack |

### Infrastructure / DevOps / Cloud
| Track | Projects | Work variant |
|---|---|---|
| SRE / DevOps Engineer | pe_hackathon + Homelab + claude_tui | sre |
| Cloud Engineer | Homelab + pe_hackathon + MRR Dashboard | systems |
| Platform Engineer | Homelab + pe_hackathon + claude_tui | systems |
| Network Engineer | EthSwitch + Homelab + claude_tui | systems |
| Distributed Systems Eng | EthSwitch + Homelab + MRR Dashboard | systems |
| Rust / Systems Programmer | claude_tui + EthSwitch + Homelab | systems |

### Data
| Track | Projects | Work variant |
|---|---|---|
| Data Analyst | MRR Dashboard + PDE Platform + maze_drl | genai |
| Data Engineer | resumeloop + mrr_dashboard + SpotiSwipe | genai |
| Quant / Numerical Methods | PDE Platform + MRR Dashboard + maze_drl | genai |
| Bioinformatics / Research Analyst | PDE Platform + maze_drl + MRR Dashboard | genai |

### QA / Testing
| Track | Projects | Work variant |
|---|---|---|
| QA Analyst / SQA Engineer | pe_hackathon + price_monitor + resumeloop | sre |
| Test Automation Engineer | pe_hackathon + price_monitor + resumeloop | sre |
| SDET / SET (Software Engineer in Test) | pe_hackathon + price_monitor + resumeloop | sre |

### Security
| Track | Projects | Work variant |
|---|---|---|
| Information Security Analyst | Homelab + EthSwitch + coq_verification | systems |
| Network Security Engineer | EthSwitch + Homelab + coq_verification | systems |
| Risk Management / Compliance | coq_verification + MRR Dashboard + HomeBoard | genai |

### Support / Embedded / Other
| Track | Projects | Work variant |
|---|---|---|
| IT Support / Helpdesk | Homelab + claude_tui + zmk | IT-track |
| System Administrator | Homelab + claude_tui + EthSwitch | systems |
| Technical Support / DevRel | Homelab + resumeloop + claude_tui | genai |
| Forward Deployed Engineer | resumeloop + mrr_dashboard + HomeBoard | genai |
| Embedded Systems Engineer | zmk + Jetson + EthSwitch | systems |
| Game Developer | maze_drl + PDE Platform + Jetson | genai |
| New Graduate / Early Career SWE | HomeBoard + MRR Dashboard + SpotiSwipe | fullstack |

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

**Seed-stage AI companies** (≤30 engineers): Prioritize resumeloop — it proves you can build a user-facing AI product end-to-end, not just glue together APIs. Generalist signal > specialist signal at this stage.

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

- MRR Dashboard is Python/FastAPI — NOT C#/ASP.NET (HomeBoard is C#)
- EthSwitch is too technical for most roles — use ONLY for Systems/Go/Networking roles
- pe_hackathon b0 starts as "Built" → override to "Scaled" to avoid verb conflict with gitlab work track
- buildv2.js project format is `{id, bullets}` — do NOT pass `{name, url, stack, date, bullets}` manually
- buildv2.js skills format is `{label, vals}` objects, NOT plain strings — skills render with bold labels via `sl()`
- `master.skills.*` tracks are stored as `{key: "vals"}` dicts — convert before passing: `Object.entries(master.skills.genai).map(([label, vals]) => ({label, vals}))`
- Low-fit rule: state fit % and flag missing tools, but still generate the resume — let Viet decide
- Carboncopies = part-time contract concurrent with M.S. — if a JD or cover letter asks about availability, clarify this; do NOT omit the overlap
- GitLab bullets: avoid "Configured GitLab CI/CD pipelines" as a lead — use result-first ("Automated quality gating for MRs by...") and name a specific feature area or bug class when possible
- Skills rows: do NOT list a category (e.g. Languages) if every tech in it is already called out in bullets — it wastes vertical space with no ATS gain

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
