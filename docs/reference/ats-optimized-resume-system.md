---
id: 2026-03-26-ats-optimized-resume-system-v2
aliases: []
tags: []
---

# ATS-Optimized Resume System v2.2

> **For Claude Cowork:** Read `master_resume_data.json` before generating any resume. All bullets are pre-validated at ≤116 chars. Do not write bullets outside this file without running validate.py.

## Architecture (Updated 2026-03-26)

**Source of truth:** `References/Jobs/master_resume_data.json` (Obsidian vault — edit here)
**Build engine:** `References/Jobs/buildv2.js` (v2.2 — copy to VM batch-build/ at session start)
**Output folder:** Resume Templates/ (mounted folder)
**Para target:** 38 | **Bullet char limit:** 116 (WITH spaces)

---

## Resume Strategy (v2 — March 2026)

### Positioning
Full-stack software engineer experienced in **GenAI, Go, distributed systems, and Linux**. Research-driven, automation-focused, production deployment experience.

### What Changed from v1
- **Removed:** Professional Summary section (wastes space, ATS matches on keywords not summaries)
- **Removed:** All "new grad" language (position as experienced engineer)
- **Added:** One-line tagline under name: `{Target Title} | Tech1 · Tech2 · Tech3 · Tech4 · Tech5`
- **Rewritten:** All bullet points follow storytelling formula
- **Reordered:** Buzzwords front-loaded in every bullet and skills tag

### Bullet Point Formula
```
I built [A = what I built]
where I did [B = the action/process]
using [C = technologies used]
produced [D = deliverable/output]
increased/improved [E = measurable metric/impact]
```

**Examples:**
- "Built end-to-end Stripe-to-BigQuery ETL pipeline in Python normalizing 6 months of billing data with idempotent loads and zero duplicate rows"
- "Architected multi-agent AI pipeline using Claude API and MCP, automating resume generation from job descriptions with 94% keyword match rate"

### Key Principles
1. **Tools to build things:** People want to see what you USED these tools to BUILD
2. **Impact and metrics:** What kind of automation, what kind of impact, how did your work improve metrics and workflow
3. **Research is strength:** Software/hardware security & safety through research & experimentation. Show purpose + achievement + impact
4. **Storytelling for HMs:** Hiring managers might not be technical — still need to understand what these things do and what tech they used
5. **Buzzwords front:** Move important/popular keywords to front of bullets, less important to the back
6. **Skills match position:** If running out of space, only list skills that match the target position
7. **Save space:** Compact education and work experience titles (degree + school same line)
8. **Don't self-limit:** Include relevant skills even if not deeply experienced — need to pass ATS screening first

### Section Order (No Professional Summary)
1. **Name + Tagline** (target title + top 5-6 tech keywords)
2. **Education** (compact: degree + school on same line)
3. **Work Experience**
4. **Relevant Projects** (2-3 projects matched to JD)
5. **Technical Skills** (only skills matching position)

---

## Work Experience Improvement Notes

### Carboncopies Foundation
- Emphasize: React dashboards, FastAPI microservices, CI/CD automation, Docker
- What was actually built: Neural simulation validation dashboards, analytics reporting endpoints
- Impact: 60% reduction in manual QA, 4+ features/sprint, deployment time from 2hr to 30min
- Automation story: CI/CD with GitHub Actions, Docker containerization, real-time monitoring

### University of Dayton — Graduate Research Assistant
- Tools: Python, TypeScript, Coq/Rocq, PyTorch
- TWO distinct research works — NEVER conflate them:
  - **KSE 2024 (PUBLISHED, NSF-funded):** Adversarial RL robustness via entropy-based imposter detection. Viet = 2nd author. Result: 97%+ accuracy.
  - **Coq/MEMOCODE (DRAFT, 1st author):** "From Program Graphs to Proofs" — formal verification of integer overflow and HTTP injection absence using Coq/Rocq and Transition Systems.
- Frame security as: improving software security and safety through research and experimentation
- Mention purpose of research + what was achieved + impact/goal
- Presented research to cross-functional teams of 100+ students
- Wrote Python and TypeScript tooling for data processing and multi-system state management

---

## Project Selection Strategy

### Ethernet Switch Note
Too technical for most roles — low ATS matching rate against other candidates. Use only for Systems/Go/Networking roles specifically.

### GitHub Strategy
- Rename/hide non-production-ready projects
- Keep production-ready projects visible with good READMEs
- Consider: video/voice-over code demos and feature walkthroughs for top projects

### Role-Track Quick Reference
| Target Role | Projects to Use |
|---|---|
| AI/LLM/Agents | ObsidianTasks + claude-tui + CalAI |
| .NET/Full-Stack | HomeBoard + MRR Dashboard + SpotiSwipe |
| Embedded/Systems | ZMK + Jetson + EthSwitch |
| Distributed/Infra | EthSwitch + Homelab + MRR Dashboard |
| Data/ML | CalAI + MRR Dashboard + Maze Solver DRL |
| Rust/Systems | claude-tui + EthSwitch + Homelab |
| Frontend/Product | CalAI + SpotiSwipe + HomeBoard |
| GenAI/Python | ObsidianTasks + CalAI + MRR Dashboard |
| SRE/DevOps | Homelab + EthSwitch + claude-tui |

---

## Vault Paths (Updated 2026-03-25)

| Resource | Path |
|---|---|
| Master resume data | `Attachments/Agents/Gemini/agents/obsidian-notes-to-resume/references/master_resume_data.json` |
| ATS guidelines | `References/Jobs/6. ats_optimization_guidelines.md` |
| ATS keyword files | `Attachments/Agents/Gemini/agents/obsidian-notes-to-resume/references/7-10.*.md` |
| DOCX templates | `~/Desktop/Resume Templates/` |
| Agent instructions | `References/Jobs/7. CLAUDE.md` |
| Gemini agent refs | `Attachments/Agents/Gemini/agents/obsidian-notes-to-resume/references/` |

---

## Pre-Generation Checklist

- [ ] NO professional summary section
- [ ] NO "new grad" language anywhere
- [ ] Tagline under name with exact target title + top technologies
- [ ] All bullets follow "Built A doing B using C, produced D, increased E" formula
- [ ] Buzzwords front-loaded in every bullet
- [ ] Section headers match standard ATS names exactly
- [ ] Contact info in document body (not header/footer)
- [ ] Date format consistently "Mon. YYYY" throughout
- [ ] 25-35 unique JD keywords woven into bullets
- [ ] Skills section only includes position-relevant skills
- [ ] DOCX generated as primary format
