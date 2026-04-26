This folder contains resume-to-job-posting matching with ATS optimization. Target: software engineering AND all CS-adjacent roles.

## Auto-Action Rules
- JD pasted/uploaded → auto-generate DOCX resume + state fit % + explain project alignment
- After DOCX is created: edit the source JD markdown file — remove the `un-resume` tag from the `tags:` block and replace it with `resume-ed`. This prevents duplicate processing. Skip only if file is not accessible.
- Skip (do not generate) any JD file whose tags already contain `resume-ed` — already processed.
- Visa kill: "US Citizen/GC only" or explicit "no sponsorship" → kill tag; export control "US person" language → kill; "authorized to work in US" → proceed (OPT/STEM OPT qualifies); standard EEO → proceed
- NO professional summary section — tagline only
- NO "new grad" language anywhere
- Tagline HARD LIMIT: **76 chars WITH spaces** — 1-line fit at 12pt Calibri, no exceptions
- Tagline format: **value-oriented, not generic**. Avoid "experienced in Tech1, Tech2, Tech3, and Tech4" — it says nothing unique. Use one of:
  - `{Job Title} building {what you build} with {tech1} and {tech2}` — action-oriented
  - `{Job Title} — {brief differentiator or achievement}` — proof-point-first
  - Examples: "Software Engineer building REST APIs in Python and Go with cloud automation" (73c) ✓
  - Examples: "Backend Engineer — 4+ prod features/sprint; FastAPI, distributed systems" (71c) ✓
  - AVOID: "Software Engineer experienced in Python, REST APIs, Go, and Cloud Services" (generic, no proof)
- Bullet HARD LIMIT: **116 chars WITH spaces** — no exceptions, guarantees 1-line fit at 11pt Calibri
- Project header HARD LIMIT: **116 chars** — `name + ' | ' + short_stack + '  GitHub  ' + date` must be ≤116
- Project stack in header: use `short_stack` field (3-4 most ATS-relevant techs, ≤40 chars) — NOT full tech list
- Bullet formula: "Built A doing B using C, **which produced D** — quantify D with before/after or %" (impact is mandatory)
- **Impact requirement**: Every bullet must answer "so what?" — add before/after, time saved, % improvement, or business outcome.
- **Business context requirement**: At least 1 bullet per work experience should explain *why* the work mattered.
- **Activity-only red flags** (always rewrite): "Collaborated with...", "Participated in...", "Assisted with...", "Worked on..." — filler unless followed by concrete outcome.
- Action verb variety: **no two bullets in one resume should start with the same verb**. Pool: Built, Designed, Engineered, Developed, Automated, Configured, Implemented, Deployed, Wrote, Contributed, Shipped, Optimized, Integrated, Orchestrated, Diagnosed, Collaborated, Analyzed, Scaffolded, Provisioned, Monitored, Scripted, Applied, Containerized, Delivered
- Every bullet must name ≥1 tool/tech + ≥1 result/impact — no vague bullets
- Front-load buzzwords in every bullet and skills row
- Para count is **dynamic in v2.3** (no longer fixed at 38). Formula: `3+3 + 1+Σ(1+bullets_per_job) + 1+Σ(1+bullets_per_proj) + 6`. Use 3-job × 5b + 3-proj × 3b = 44 paras for most roles. Verify 1-page fit in Word.
- Always read master_resume_data.json before generating any resume — all bullets pre-validated
- **v2.3 data shape**: `data.work = [{id, bullets[]}]` and `data.projects = [{id, bullets[]}]` and `data.skills = ['string · string · ...']`. Work IDs: `gitlab` | `carboncopies` | `udayton` | `augustana`. Project IDs resolved via master_resume_data.json lookup in buildv2.js. WORK_META headers live in buildv2.js.
- **Skills format**: plain strings, e.g. `'Python · SQL · Docker · CI/CD · Linux'` — 5 rows, front-load ATS keywords
- Education format: `School – Degree` on one line, dates right-aligned
- Combined work line: `Bold Title | Company — Location    Bold Dates` (single line) — from WORK_META
- Project header: `Bold Name | short_stack    GitHub  Date` (GitHub = hyperlink when URL available)
- Research bullets: PURPOSE + ACHIEVEMENT + IMPACT — NEVER fabricate. See fabrication_warnings in JSON.
- Co-authored papers: mention venue + viet's role (2nd author KSE2024, 1st author Coq) + result
- Contact row: "Portfolio" (not "Website")

## Session Init (run at start of every Cowork session)
```bash
mkdir -p /sessions/bold-dazzling-hopper/batch-build
cd /sessions/bold-dazzling-hopper/batch-build
cp /sessions/bold-dazzling-hopper/mnt/Jobs/master_resume_data.json . 2>/dev/null && echo "✓ data synced"
cp /sessions/bold-dazzling-hopper/mnt/Jobs/buildv2.js . 2>/dev/null && echo "✓ buildv2 synced"
[ ! -d node_modules ] && npm install
```

## Paragraph Count Formula (v2.3 — dynamic)
```
3  header   : name + contact row + tagline
3  education: section header + 2 compact "School – Degree" lines
1 + N×(1+B_w) work    : section header + N jobs × (work line + B_w bullets)
1 + P×(1+B_p) projects: section header + P projects × (project header + B_p bullets)
1 + 5         skills  : section header + 5 skill rows
```

**Typical layouts:**
| Jobs × bullets | Projs × bullets | Para count | Likely fits 1 page? |
|----------------|-----------------|------------|---------------------|
| 2 × 5b         | 3 × 3b          | 38         | Yes (v2.2 baseline) |
| 2 × 5b         | 3 × 4b          | 41         | Probably (test it)  |
| 3 × 5b         | 3 × 3b          | 44         | Probably (test it)  |
| 3 × 5b         | 3 × 4b          | 47         | Likely 2-page       |

Default target: **3-job × 5b + 3-proj × 3b = 44 paras** — verify 1-page fit in Word after building.

## Data Sources (Obsidian vault = ~/Obsidian/References/Jobs/)
- **Master resume data (edit here):** `References/Jobs/master_resume_data.json`
- **Build engine (edit here):** `References/Jobs/buildv2.js`
- **ATS guidelines:** `References/Jobs/6. ats_optimization_guidelines.md`
- **System plan:** `References/Jobs/5. ats-optimized-resume-system.md`
- **This file:** `References/Jobs/7. CLAUDE.md`
- **VM working dir (session-only):** `/sessions/bold-dazzling-hopper/batch-build/`
- **Resume output:** Resume Templates/ (mounted folder — persists)

## Candidate
- Name: Quoc-Viet Bui
- Email: buiquocviet99@gmail.com | Phone: 309 631 4531
- Location: Harrisburg, PA
- LinkedIn: linkedin.com/in/vietbui99 | Portfolio: vietbui1999ru.github.io
- M.S. CS, University of Dayton (Dec 2025) | Dual B.A. Applied Math + CS, Augustana College (May 2023)
- Work auth: OPT + STEM OPT (up to 3 years, no H-1B sponsorship needed yet)
- Current: Open Source Contributor @ GitLab/CodePath (Feb 2026 -- Present) + Complex Systems Research Engineer @ Carboncopies Foundation (Jul 2025 -- Present)
- Positioning: Full-stack SWE experienced in GenAI, Go, distributed systems, Linux
- CS-adjacent assets: Augustana IT Help Desk (hardware diagnostics, network config, OS troubleshooting); 300+ students tutored; peer code review; math research (MATLAB, Python numerical analysis)

## Work Track Variants
Two work bullet tracks are stored per employer. Pick based on role:

**genai track** (Python/LLM/automation/data/product roles):
- gitlab: Contributed, Built, Configured, Automated, Collaborated
- carboncopies: Implemented, Developed, Scripted, Maintained, Debugged
- udayton: Co-authored, Engineered, Wrote, Designed, Authored

**systems track** (Go/infra/SRE/backend/embedded/networking roles):
- gitlab: Contributing, Automated, Configured, Collaborated, Built
- carboncopies: Implemented, Scripted, Developed, Diagnosed, Wrote
- udayton: Engineered, Co-authored, Shipped, Designed, Authored

**IT/Helpdesk track** (IT support/sysadmin/helpdesk — uses gitlab+udayton+augustana, NOT carboncopies):
- Same gitlab + udayton (systems verbs) + augustana (Resolved, Tutored, Graded, Completed, Analyzed)
- Put augustana IT Help Desk bullet FIRST in the augustana block

## Project Stack Ground Truth
- MRR Dashboard: FastAPI, React, Recharts, BigQuery, Python, Stripe API
- HomeBoard: ASP.NET Core 8, C#, React, TypeScript, PostgreSQL, Redis, Docker, xUnit, Testcontainers
- SpotiSwipe: Next.js, React, TypeScript, tRPC, Prisma, PostgreSQL, OAuth 2.0, Docker
- CalAI: Next.js, LangChain, Gemini AI, Google Calendar API, OAuth 2.0, Zod
- PDE Platform: FastAPI, React, TypeScript, Plotly.js, NumPy, Docker, Nginx
- EthSwitch: Go, IEEE 802.3, Goroutines, Channels, CRC32
- Maze Solver DRL: Python, PyTorch, Deep Q-Network (DQN), NumPy
- Homelab: Proxmox, Prometheus, Grafana, Terraform, Ansible, WireGuard, Docker, BIOS/UEFI, GRUB, Kubernetes (k8s), physical network switch, dual-NIC, VLAN, 3 physical bare-metal servers
- ZMK: ZMK, nRF52840, Devicetree, BLE HID, GitHub Actions
- Jetson: NVIDIA Jetson, CUDA, PyTorch, MIPI CSI-2, Python
- pe_hackathon: Flask, Peewee ORM, PostgreSQL, Redis, Nginx, Gunicorn, Prometheus, Grafana, Alertmanager, Docker, GitHub Actions, pytest, k6
- KSE2024 (published): "Imposter Injection" — RL adversarial robustness, entropy-based feature selection. Viet = 2nd author. NOT about Coq/formal verification.
- Coq/Rocq (draft, 1st author): "From Program Graphs to Proofs" — formal security verification. NOT published at KSE 2024.
- claude-tui: Rust, tokio, ratatui, SQLite WAL, JSON-RPC 2.0, Unix Sockets
- ObsidianTasks: TypeScript, React Flow, Node.js, Claude API, MCP, Agent Orchestrator

## Role-Track Project Picks (full list)

### Core SWE Tracks
| Track | Projects | Work | Notes |
|-------|----------|------|-------|
| Software Engineer / Full-Stack | HomeBoard + MRR Dashboard + SpotiSwipe | genai | C#/.NET + Python + TypeScript full-stack |
| Backend / API Engineer | MRR Dashboard + HomeBoard + EthSwitch | systems | FastAPI, Go, distributed |
| Frontend / Product Engineer | CalAI + SpotiSwipe + HomeBoard | genai | Next.js, React, TypeScript |
| GenAI / AI Engineer | ObsidianTasks + CalAI + MRR Dashboard | genai | LLM orchestration, agentic AI |
| AI/LLM/Agents | ObsidianTasks + claude-tui + CalAI | genai | Agent SDK, MCP, Claude API |
| ML Engineer | Jetson + maze_drl + MRR Dashboard | genai | PyTorch, CUDA, DQN |
| MLOps / Platform Eng | pe_hackathon + Homelab + claude-tui | systems | CI/CD, monitoring, Docker, k8s |
| Vibe Coding / AI Dev Tools | ObsidianTasks + claude-tui + CalAI | genai | Claude API, agentic workflows, UI |
| .NET / C# Engineer | HomeBoard + MRR Dashboard + SpotiSwipe | genai | ASP.NET Core, xUnit, PostgreSQL |

### Infrastructure / DevOps / Cloud Tracks
| Track | Projects | Work | Notes |
|-------|----------|------|-------|
| SRE / DevOps Engineer | pe_hackathon + Homelab + claude-tui | systems | Prometheus, Grafana, Docker, k8s, IaC |
| Cloud Engineer | Homelab + pe_hackathon + MRR Dashboard | systems | Terraform, Ansible, k8s, WireGuard |
| Platform Engineer | Homelab + pe_hackathon + claude-tui | systems | Observability, IaC, CI/CD, bare-metal |
| Network Engineer | EthSwitch + Homelab + claude-tui | systems | Go, IEEE 802.3, VLAN, dual-NIC |
| Distributed Systems Eng | EthSwitch + Homelab + MRR Dashboard | systems | Go goroutines, k8s, distributed |
| Rust / Systems Programmer | claude-tui + EthSwitch + Homelab | systems | Rust, Go, Unix sockets, low-level |

### Data Tracks
| Track | Projects | Work | Notes |
|-------|----------|------|-------|
| Data Analyst | MRR Dashboard + PDE Platform + maze_drl | genai | SQL, BigQuery, Python, Recharts |
| Data Engineer | ObsidianTasks + MRR Dashboard + CalAI | genai | ETL, Python, BigQuery, pipelines |
| Analytics Engineer | MRR Dashboard + ObsidianTasks + CalAI | genai | BigQuery, SQL, dbt-adjacent |
| Bioinformatics / Research Analyst | PDE Platform + maze_drl + MRR Dashboard | genai | NumPy, Python, numerical methods, research |
| Quant / Numerical Methods | PDE Platform + MRR Dashboard + maze_drl | genai | NumPy, Python, PDEs, mathematical modeling |

### QA / Testing Tracks
| Track | Projects | Work | Notes |
|-------|----------|------|-------|
| QA Analyst / SQA Engineer | pe_hackathon + Jetson + HomeBoard | systems | pytest, xUnit, CI/CD gate, race detector |
| Software Quality Tester | pe_hackathon + HomeBoard + EthSwitch | systems | pytest 66% cov, xUnit, Go race detector |
| Test Automation Engineer | pe_hackathon + Jetson + HomeBoard | systems | pytest CI/CD, Testcontainers, k6 load |

### Security Tracks
| Track | Projects | Work | Notes |
|-------|----------|------|-------|
| Information Security Analyst | Homelab + EthSwitch + coq_verification | systems | Formal verification, VLAN, security framing |
| Network Security Engineer | EthSwitch + Homelab + coq_verification | systems | IEEE 802.3, VLAN, formal proofs |
| Risk Management / Compliance | coq_verification + MRR Dashboard + HomeBoard | genai | Formal verification, SLA monitoring, audit trail |

### Support / IT Tracks
| Track | Projects | Work | Notes |
|-------|----------|------|-------|
| IT Support / IT Helpdesk | Homelab + claude-tui + zmk | IT-track | gitlab+udayton+augustana; IT Help Desk bullet first |
| System Administrator | Homelab + claude-tui + EthSwitch | systems | Proxmox, VLAN, WireGuard, bare-metal |
| Technical Support / DevRel | Homelab + ObsidianTasks + claude-tui | genai | gitlab+carboncopies+udayton |
| Forward Deployed Engineer | ObsidianTasks + MRR Dashboard + HomeBoard | genai | Full-stack + AI automation + client-facing |

### Embedded / Hardware Tracks
| Track | Projects | Work | Notes |
|-------|----------|------|-------|
| Embedded Systems Engineer | zmk + Jetson + EthSwitch | systems | nRF52840, CUDA, Go, firmware |
| Game Developer | maze_drl + PDE Platform + Jetson | genai | PyTorch DQN (game AI). LOW FIT if Unity/Unreal req'd |

### Early Career / Broad Titles
| Track | Projects | Work | Notes |
|-------|----------|------|-------|
| New Graduate / Early Career SWE | HomeBoard + MRR Dashboard + CalAI | genai | Broadest stack coverage |
| Early Career Program (rotation) | HomeBoard + pe_hackathon + ObsidianTasks | genai | Shows diversity: C#, Python, AI |

## CS-Adjacent Role Notes
- **IT/Helpdesk**: Use gitlab+udayton+augustana. Augustana b3 ("Resolved IT Help Desk tickets...") is anchor — put it FIRST. Homelab shows sysadmin depth.
- **QA/Testing**: pe_hackathon b2 ("Hardened CI/CD pipeline with 30 pytest tests at 66% coverage") is QA anchor. EthSwitch "Validated with Go race detector" extends narrative.
- **Game Dev**: Maze Solver DRL (PyTorch DQN = game AI). Flag LOW FIT if role requires Unity/Unreal/C++ — not in stack.
- **Data Analyst**: MRR Dashboard (BigQuery, SQL, ETL, Recharts) is anchor. Flag if role requires Tableau — not in stack.
- **Bioinformatics**: Carboncopies (biophysical neuron simulation + Python pipelines) is the strongest fit signal. PDE Platform (NumPy numerical solvers) adds scientific computing depth.
- **Information Security**: coq_verification (formal security proofs) + Homelab (VLAN isolation, WireGuard, 0600 permissions) covers the security angle. Research framing: "Improved security of systems through formal verification."
- **Risk Management**: coq_verification (provable correctness), MRR Dashboard (audit-trail ETL), HomeBoard (resilience patterns). Flag if role is non-technical compliance-only.
- **Network Engineer**: EthSwitch (Go IEEE 802.3 implementation) + Homelab (VLAN, dual-NIC, physical switch wiring). Strong signal. Weak on Cisco IOS/CCNA.
- **Forward Deployed Engineer**: ObsidianTasks (client-facing AI pipelines) + full-stack (HomeBoard, MRR). Requires explaining AI + engineering + communication skills.
- **MLOps**: pe_hackathon (CI/CD gates, Prometheus, Alertmanager, k6) + Homelab (k8s, Terraform). Weak on managed ML platforms (Vertex AI, SageMaker).
- **Vibe Coding / AI Dev Tools**: ObsidianTasks (Claude API + React Flow UI + MCP) + claude-tui. Strong for companies building LLM-first products.
- **Low-fit rule**: State fit % and flag specific missing tools/domain. Still generate resume — let Viet decide.

## EthSwitch Note
Too technical for most roles — low ATS matching rate. Use ONLY for Systems/Go/Networking-specific roles.

## pe_hackathon Note
MLH PE Hackathon 2026. Flask URL shortener + SRE practices. Master b0 starts with "Built" → override to "Scaled" to avoid verb conflicts with gitlab work track. b1 "Instrumented", b2 "Hardened".

## Key Errors to Avoid
- MRR Dashboard is Python/FastAPI — NOT C#/ASP.NET (HomeBoard is C#)
- Never fabricate stack items; always cross-check project stack ground truth above
- Never use "new grad" language — position as experienced engineer
- Never add a professional summary section — use tagline only
- **NEVER conflate the two research works:**
  - KSE 2024 paper = "Imposter Injection" = RL adversarial robustness (NOT about Coq/formal verification)
  - Coq/Rocq paper = "From Program Graphs to Proofs" = formal security verification (DRAFT, NOT published at KSE 2024)
- Never say the KSE 2024 paper is about formal verification, Coq, or program graphs
- Never say the Coq/Rocq draft paper is published at KSE 2024
- The Coq/Rocq paper has Viet as FIRST author; the KSE 2024 paper has Viet as second author
- **buildv2.js projects format**: `{id, bullets}` — project metadata (name/stack/dates) auto-resolved from master_resume_data.json. Do NOT pass `{name, url, stack, date, bullets}` manually.
- **buildv2.js skills format**: plain strings `'Python · SQL · ...'` — NOT `{label, vals}` objects.
- Always sync master_resume_data.json AND buildv2.js to batch-build at session start
