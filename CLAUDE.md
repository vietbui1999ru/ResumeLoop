# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

Resume + outreach automation for Quoc-Viet Bui. Given JD markdown file, produce tailored ATS-optimized 1-page DOCX resume, fit assessment, outreach drafts.

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
7. **Verify** DOCX exists
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
| Para count for 1-page fit (default) | 38–48 (target 44: 3-job×5b + 3-proj×3b) |
| Skills rows | 5 rows, plain strings `'Tech · Tech · ...'` |

**Tagline format** — value-oriented, not generic:
- `{Title} building {what} with {tech1} and {tech2}` — action-oriented
- `{Title} — {differentiator or achievement}` — proof-point-first
- AVOID: "Software Engineer experienced in Python, REST APIs, Go, and Cloud Services"

**Bullet formula**: "Built A doing B using C, which produced D" — impact mandatory. Every bullet: ≥1 tool/tech + ≥1 result. Activity-only red flags (always rewrite): "Collaborated with...", "Participated in...", "Assisted with...".

**Action verb variety**: no two bullets in one resume start with same verb.

**NO** professional summary — tagline only. **NO** "new grad" language.

## Architecture

### Data Flow
```
JD markdown → visa check → role-track lookup → bullet selection from JSON
           → build script → node buildv2.js → DOCX output
```

### Key Files
- `master_resume_data.json` — single source of truth for all bullets. `data.work = [{id, bullets[]}]`, `data.projects = [{id, bullets[]}]`, `data.skills = ['string · string · ...']`
- `buildv2.js` — DOCX generation engine. Project input: `{id, bullets}` only — metadata auto-resolved from JSON. Skills: plain strings, NOT `{label, vals}` objects.
- `batch-build/` — working dir for build execution; copy both files here each session
- `JobData/Jobs/` — 558 JD markdown files with frontmatter tags (`un-resume` → `resume-ed`)
- `docs/reference/CLAUDE-full.md` — full authoritative rules doc (this file is condensed version)

### buildv2.js Data Shape (v2.3)
Work IDs: `gitlab` | `carboncopies` | `udayton` | `augustana`. WORK_META headers live in buildv2.js. Project IDs resolved from `master_resume_data.json`. Sync both files to `batch-build/` before running.

## Candidate

- **Name**: Quoc-Viet Bui
- **Email**: buiquocviet99@gmail.com | **Phone**: 309 631 4531
- **Location**: Harrisburg, PA
- **LinkedIn**: linkedin.com/in/vietbui99 | **Portfolio**: vietbui1999ru.github.io (use "Portfolio", not "Website")
- **Education**: M.S. CS, Univ. of Dayton (Dec 2025) | Dual B.A. Applied Math + CS, Augustana College (May 2023)
- **Work auth**: OPT + STEM OPT (up to 3 years total, no H-1B needed yet)
- **Current roles**: Open Source Contributor @ GitLab/CodePath (Feb 2026–) + Complex Systems Research Eng @ Carboncopies (Jul 2025–)
- **Positioning**: Full-stack SWE — GenAI, Go, distributed systems, Linux; iOS (SwiftUI/SwiftData, targeting new-grad iOS roles)

## Work Track Variants

Two bullet tracks per employer. Pick based on role:

**genai** (Python/LLM/automation/data/product): gitlab, carboncopies, udayton
**systems** (Go/infra/SRE/backend/embedded/networking): gitlab, carboncopies, udayton
**IT-track** (IT support/helpdesk/sysadmin): gitlab + udayton + **augustana** (NOT carboncopies) — put augustana IT Help Desk bullet FIRST

## Role-Track Project Picks

### Core SWE
| Track | Projects | Work variant |
|---|---|---|
| iOS Engineer | OutfitTracker + CalAI + SpotiSwipe | genai |
| Software Engineer / Full-Stack | HomeBoard + MRR Dashboard + SpotiSwipe | genai |
| Backend / API Engineer | MRR Dashboard + HomeBoard + EthSwitch | systems |
| Frontend / Product Engineer | OutfitTracker + CalAI + SpotiSwipe | genai |
| GenAI / AI Engineer | ObsidianTasks + CalAI + MRR Dashboard | genai |
| AI/LLM/Agents | ObsidianTasks + claude-tui + CalAI | genai |
| Vibe Coding / AI Dev Tools | ObsidianTasks + claude-tui + CalAI | genai |
| ML Engineer | Jetson + maze_drl + MRR Dashboard | genai |
| MLOps / Platform Eng | pe_hackathon + Homelab + claude-tui | systems |
| .NET / C# Engineer | HomeBoard + MRR Dashboard + SpotiSwipe | genai |

### Infrastructure / DevOps / Cloud
| Track | Projects | Work variant |
|---|---|---|
| SRE / DevOps Engineer | pe_hackathon + Homelab + claude-tui | systems |
| Cloud Engineer | Homelab + pe_hackathon + MRR Dashboard | systems |
| Platform Engineer | Homelab + pe_hackathon + claude-tui | systems |
| Network Engineer | EthSwitch + Homelab + claude-tui | systems |
| Distributed Systems Eng | EthSwitch + Homelab + MRR Dashboard | systems |
| Rust / Systems Programmer | claude-tui + EthSwitch + Homelab | systems |

### Data
| Track | Projects | Work variant |
|---|---|---|
| Data Analyst | MRR Dashboard + PDE Platform + maze_drl | genai |
| Data Engineer | ObsidianTasks + MRR Dashboard + CalAI | genai |
| Quant / Numerical Methods | PDE Platform + MRR Dashboard + maze_drl | genai |
| Bioinformatics / Research Analyst | PDE Platform + maze_drl + MRR Dashboard | genai |

### QA / Testing
| Track | Projects | Work variant |
|---|---|---|
| QA Analyst / SQA Engineer | pe_hackathon + Jetson + HomeBoard | systems |
| Test Automation Engineer | pe_hackathon + Jetson + HomeBoard | systems |

### Security
| Track | Projects | Work variant |
|---|---|---|
| Information Security Analyst | Homelab + EthSwitch + coq_verification | systems |
| Network Security Engineer | EthSwitch + Homelab + coq_verification | systems |
| Risk Management / Compliance | coq_verification + MRR Dashboard + HomeBoard | genai |

### Support / Embedded / Other
| Track | Projects | Work variant |
|---|---|---|
| IT Support / Helpdesk | Homelab + claude-tui + zmk | IT-track |
| System Administrator | Homelab + claude-tui + EthSwitch | systems |
| Technical Support / DevRel | Homelab + ObsidianTasks + claude-tui | genai |
| Forward Deployed Engineer | ObsidianTasks + MRR Dashboard + HomeBoard | genai |
| Embedded Systems Engineer | zmk + Jetson + EthSwitch | systems |
| Game Developer | maze_drl + PDE Platform + Jetson | genai |
| New Graduate / Early Career SWE | HomeBoard + MRR Dashboard + CalAI | genai |

## Project Stack Ground Truth

| Project | Stack |
|---|---|
| OutfitTracker | SwiftUI, SwiftData, PhotosUI, Vision, Swift Charts, async/await, Core ML (iOS 17+) |
| MRR Dashboard | FastAPI, React, Recharts, BigQuery, Python, Stripe API |
| HomeBoard | ASP.NET Core 8, C#, React, TypeScript, PostgreSQL, Redis, Docker, xUnit, Testcontainers |
| SpotiSwipe | Next.js, React, TypeScript, tRPC, Prisma, PostgreSQL, OAuth 2.0, Docker |
| CalAI | Next.js, LangChain, Gemini AI, Google Calendar API, OAuth 2.0, Zod |
| PDE Platform | FastAPI, React, TypeScript, Plotly.js, NumPy, Docker, Nginx |
| EthSwitch | Go, IEEE 802.3, Goroutines, Channels, CRC32 |
| Maze Solver DRL | Python, PyTorch, Deep Q-Network (DQN), NumPy |
| Homelab | Proxmox, Prometheus, Grafana, Terraform, Ansible, WireGuard, Docker, k8s, VLAN, dual-NIC, 3 bare-metal servers |
| ZMK | ZMK, nRF52840, Devicetree, BLE HID, GitHub Actions |
| Jetson | NVIDIA Jetson, CUDA, PyTorch, MIPI CSI-2, Python |
| pe_hackathon | Flask, Peewee ORM, PostgreSQL, Redis, Nginx, Gunicorn, Prometheus, Grafana, Alertmanager, Docker, GitHub Actions, pytest, k6 |
| claude-tui | Rust, tokio, ratatui, SQLite WAL, JSON-RPC 2.0, Unix Sockets |
| ObsidianTasks | TypeScript, React Flow, Node.js, Claude API, MCP, Agent Orchestrator |

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

## Feedback Loop

After each resume generation, if Viet flags issues or requests changes:

1. **Rate (optional)** — prefix message with `rate: X/3` (1=bad, 2=ok, 3=good)
2. **I apply the fix**, then invoke `capture-mistake` → appends structured entry to `feedback/raw-log.md`
3. **Synthesize** — when `feedback/raw-log.md` has ≥5 entries, or on demand ("synthesize feedback"), invoke `synthesize-mistakes` → distills patterns into "Key Errors to Avoid" below

Trigger phrases:
- `"synthesize feedback"` → run `synthesize-mistakes` on `feedback/raw-log.md`
- `"rate: X/3 — <note>"` → I log it even if no code change needed

`feedback/raw-log.md` — running log of all issues + fixes across JDs.

## Key Errors to Avoid

- MRR Dashboard is Python/FastAPI — NOT C#/ASP.NET (HomeBoard is C#)
- EthSwitch too technical for most roles — use ONLY for Systems/Go/Networking roles
- pe_hackathon b0 starts as "Built" → override to "Scaled" to avoid verb conflict with gitlab work track
- buildv2.js project format is `{id, bullets}` — do NOT pass `{name, url, stack, date, bullets}` manually
- buildv2.js skills format is plain strings `'Python · SQL · ...'` — NOT `{label, vals}` objects
- Low-fit rule: state fit % + flag missing tools, but still generate resume — let Viet decide
- OutfitTracker URL is TBD (placeholder: github.com/vietbui1999ru/OutfitTracker) — update when repo public
- OutfitTracker bullets are estimates (metrics: ~80% cache speedup) — update with Instruments data as features ship

## Agent skills

### Issue tracker
GitHub — `github.com/vietbui1999ru/ResumeLoop`. See `docs/agents/issue-tracker.md`.

### Triage labels
Standard five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs
Single-context — `CONTEXT.md` at root + `docs/adr/` for architecture decisions. See `docs/agents/domain.md`.