# Generation Harness Design

**Date:** 2026-05-06  
**Scope:** Claude Code CLI harness for resume generation — skill + deterministic validator  
**Not in scope:** Web app changes, outreach automation, buildv2.js internals

---

## Problem

Current `agents/AGENT.md` is 10 comment lines with no enforcement. Observed failures:
- Wrong bullet selection (wrong track or work IDs)
- Constraint violations slipping through (tagline >76c, bullets >116c)
- DOCX layout not matching templates
- Claude skipping steps (tagging, outreach)
- Profile title echoing JD job title instead of candidate persona

---

## Architecture

```
./
├── .claude/skills/generate-resume/
│   └── generate-resume.md     ← skill: full harness instructions + checkpoint gates
├── harness/
│   ├── validate.js             ← deterministic constraint checker (Node, no deps)
│   └── batch-build/            ← working dir for build execution (gitignored)
└── jobs/                       ← drop JDs here; frontmatter tags drive workflow
```

**Trigger:** `/generate` in Claude Code. Skill loads, scans `./jobs/` for `un-resume` tagged files, builds queue, processes in sequence.

**Validator contract:**
- Input: path to generated build script
- Exit 0: prints `✓ VALID`
- Exit 1: prints each violation with exact fix needed
- Claude reads stdout, fixes flagged items only, re-runs node, re-runs validator — loop until exit 0

---

## Skill Workflow

```
1. SCAN       Find all un-resume JDs → print queue + count, wait for confirmation

2. PER-JD LOOP
   a. PARSE     Extract: company, role title, tech stack, requirements
   b. VISA GATE Check rules from CLAUDE.md → if kill: tag `visa-kill`, skip
   c. TRACK     Map role → role-track table → select work IDs + variant (genai/systems/IT-track)
   d. BULLETS   Pull EXACT text from master_resume_data.json — no paraphrase, no rewrite
   e. TITLE     Derive persona title from candidate positioning, NOT JD job title
                Formula: "{Track-Title} {building/specializing in} {differentiator}"
                Example: "Full-Stack SWE building distributed systems with Go and Python"
   f. TAGLINE   Generate ≤76c → run validate.js → if fail: rewrite + re-run until exit 0
   g. BUILD     Generate build script → run: node harness/batch-build/<script>.js
   h. VALIDATE  Run validate.js on full output:
                  tagline ≤76c
                  each bullet ≤116c
                  para count = 44 (3-job×5b + 3-proj×3b)
                  skills rows = 5
                Fix specific violations only → re-run node → re-validate (loop until exit 0)
   i. OUTPUT    Move DOCX → {OUTPUT_PATH}/{company}_{role}_vietbui.docx
   j. TAG       Update JD frontmatter: un-resume → resume-ed (only after validator exit 0)
   k. OUTREACH  [SKIPPED] Print: "Outreach chat ready for <company> when needed"
   l. SUMMARY   Print: fit%, track chosen, work IDs used, projects used

3. BATCH DONE  Print: N processed, M skipped (visa-kill or already resume-ed), output paths
```

---

## Validator Script

`harness/validate.js <build-script-path>`

Parses the generated build script, extracts content fields, checks:

| Check | Constraint | Failure message |
|---|---|---|
| Tagline length | ≤76c | `FAIL tagline: 82c — trim 6` |
| Each bullet length | ≤116c | `FAIL bullet [work.gitlab.2]: 119c` |
| Para count | = 44 | `FAIL para count: 47 (target 44)` |
| Skills rows | = 5 | `FAIL skills: 4 rows (need 5)` |
| Profile title | not verbatim JD title | `WARN title: matches JD title verbatim` |

Para count = 44 is the 1-page proxy (3 jobs × 5 bullets + 3 projects × 3 bullets). If DOCX still renders wrong after count passes, the issue is in `buildv2.js` template logic — fix there, not in the harness.

---

## Outreach — Follow-Up Chat (separate, optional)

After reviewing the generated DOCX, the user initiates a follow-up chat. No separate skill needed — conversational pattern:

```
1. LOAD       Claude reads the JD file + fit summary from step l
2. ROLE-FRAME Confirm framing: "For this role at X, positioning as [Y] — confirm or redirect?"
              (prevents role/persona confusion before any drafting)
3. CONTACTS   Ask for specific contacts, referrals, hiring manager names
4. CONTEXT    Ask for special angle (mutual connection, relevant project, inside knowledge)
5. DRAFT
   a. LinkedIn note   ≤300 chars, warm, role-specific
   b. Email           subject + body, 3–5 sentences
   c. Cover letter    optional — only if role requires it; 3 paragraphs max
6. REVIEW     Present all drafts → user edits before sending
```

Step 2 (role-frame) is the key guard against misrepresentation. Always runs before drafting.

---

## Files to Create

| File | Notes |
|---|---|
| `.claude/skills/generate-resume/generate-resume.md` | Skill content — full workflow with checkpoint gates |
| `harness/validate.js` | Node script, no external deps, exit-code contract |

## Files to Update

| File | Change |
|---|---|
| `agents/AGENT.md` | Replace with pointer to skill |
| `.gitignore` | Add `harness/batch-build/` |
