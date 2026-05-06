# ResumeAnalyze

Personal resume generation and job tracking system. Given a job description, produces a tailored 1-page ATS-optimized DOCX resume and tracks application status.

## Architecture

**Clean split:** the web app handles tracking and visualization only. All resume generation runs through Claude Code CLI.

```
Web app (Next.js)         Claude Code CLI
─────────────────         ───────────────
Job tracking              /generate skill
Analytics dashboard       validate.js
Tag filtering             master_resume_data.json
Pipeline Sankey           buildv2.js → DOCX output
```

## Generating a Resume

1. Drop a JD markdown file into `jobs/` with `tags: [un-resume, ...]` in frontmatter
2. Open Claude Code in this repo
3. Run `/generate`

The harness scans for `un-resume` tagged JDs, runs visa check → role-track selection → bullet copy → tagline → build → validation loop → DOCX output → tags JD as `resume-ed`.

Output: `{OUTPUT_PATH}/{company}_{role}_vietbui.docx`

See `.claude/skills/generate-resume/generate-resume.md` for the full workflow.

## Validation

`harness/validate.js` enforces hard constraints before any DOCX is finalized:

| Check | Limit |
|---|---|
| Tagline | ≤76 chars |
| Each bullet | ≤116 chars |
| Para count (1-page proxy) | = 44 |
| Skills rows | = 5 |

```bash
node harness/validate.js <build-script.js>
# exit 0: ✓ VALID
# exit 1: lists each violation
```

## Web App

```bash
npm run dev   # http://localhost:3000
```

Reads JD files from `jobs/` and SQLite (`resume.db`). Pages: Dashboard, Jobs, Settings.

## Key Files

| File | Purpose |
|---|---|
| `pipeline/master_resume_data.json` | All bullets — single source of truth |
| `pipeline/buildv2.js` | DOCX generation engine |
| `CLAUDE.md` | Candidate profile, hard constraints, role-track table |
| `harness/validate.js` | Constraint checker |
| `.claude/skills/generate-resume/` | `/generate` skill |
