---
title: "Hero Page Plan"
type: planning
description: "Landing page structure, positioning, and copy-paste setup commands for ResumeLoop."
tags: [marketing, landing-page, install, local-first]
updated: 2026-06-17
---

# Hero Page Plan

Goal: make a first-time visitor understand ResumeLoop in 10 seconds, then give them a copy-paste path to run it locally.

## Scope

- Public landing page only.
- Web onboarding is out of scope for now.
- Primary setup path is CLI/workspace onboarding.
- Page should not imply cloud accounts, API keys, or hosted personal data.

## Hero

Headline:

> Tailor resumes locally with the AI CLI you already use.

Subhead:

> Paste a job description. ResumeLoop scores the fit, selects your best bullets, and generates an ATS-ready DOCX plus polished PDF from files on your machine.

Primary CTA:

> Install locally

Secondary CTA:

> Clone from GitHub

Trust line:

> No API keys. No account. No cloud data store. Your profile and jobs stay in `data/`.

## Copy-Paste Setup Blocks

### Install From npm

Target once package distribution is ready:

```bash
npm i -g resumeloop
resumeloop init ~/career
resumeloop onboard ~/career
resumeloop import ~/Downloads/resume.txt ~/career
RESUMELOOP_HOME=~/career resumeloop
```

### Run From Source

Works today:

```bash
git clone https://github.com/vietbui1999ru/ResumeLoop.git
cd ResumeLoop
npm install
npx tsx bin/resumeloop.ts init ~/career
npx tsx bin/resumeloop.ts onboard ~/career
RESUMELOOP_HOME=~/career npm run dev
```

Then open:

```text
http://127.0.0.1:3000
```

### Add Job Files

```bash
mkdir -p ~/career/data/jobs
$EDITOR ~/career/data/jobs/acme-backend.md
npx tsx bin/resumeloop.ts reindex ~/career
```

Example job file:

```md
---
company: Acme
role_title: Backend Engineer
source: https://example.com/jobs/backend
Action: 0
---

Paste the job description here.
```

## Page Sections

1. Hero with two CTAs and terminal command card.
2. Three-step flow: pick brain, import profile, generate resumes.
3. Local-first proof: files canonical, SQLite cache, provider CLI seam.
4. Output proof: DOCX, PDF, fit assessment, outreach drafts.
5. Provider strip: Claude Code, Codex, Gemini, opencode, Ollama.
6. Install tabs: npm target and source today.
7. FAQ: API keys, data location, supported CLIs, PDF dependency, web onboarding scope.

## Visual Direction

- Developer-tool landing page, not SaaS dashboard.
- Use terminal cards and file-tree visuals instead of generic app screenshots.
- Show `data/profile.json`, `data/jobs/*.md`, and `.cache/index.db` as the core mental model.
- Keep copy concrete: "writes `data/resumes/*.docx`" beats "boost your career".

## Implementation Notes

- If built inside current Next app, keep it separate from authenticated/cloud-era app routes.
- Prefer static content first; no provider detection or onboarding wizard on the page.
- Command blocks should have copy buttons.
- Mark npm install path as "coming soon" until package name and bin distribution are finalized.
