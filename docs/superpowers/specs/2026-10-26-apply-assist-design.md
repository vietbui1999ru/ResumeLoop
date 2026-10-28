---
status: draft
created: 2026-10-26
owner: Viet Bui
---

# Apply Assist: human-in-the-loop form filling for ATS portals

## Context

ResumeLoop already turns a clipped job description into a tailored resume. The next bottleneck is the application form itself. Enterprise portals (Workday, Greenhouse, Taleo) use deep, generic markup, nested "Add Row" repeaters for work history and education, multi-page wizards, and strict field validation. General-purpose LLM browser agents lose track of state on these forms, loop on repeaters, and stall on challenge pages.

This spec files the original "AI Operational Manifest" (kept verbatim in the appendix) and adapts it to ResumeLoop's stack and constraints. It is a design draft. No code exists yet.

The core idea from the manifest is kept: separate *mapping* a form (a Research step that produces a cached blueprint) from *filling* it (a deterministic loop that follows the blueprint), and fall back to the human whenever the loop is unsure.

## Scope and non-goals

In scope: filling application fields from the candidate's own profile and generated resume, in the candidate's own browser session, for one job at a time, with the candidate watching.

Out of scope, by design:

- Evading bot detection. No stealth plugins (do not reuse `playwright-stealth` from other projects), no fingerprint or mouse-trajectory spoofing, no CAPTCHA solving. A challenge page always hands control to the human.
- Final submission by the agent. The agent stops at the review or submit step; the human clicks Submit.
- Mass or unattended application runs. Workday and Greenhouse terms of service may prohibit automated access, and an account can be locked. Running one attended application at a time keeps the tool an assistant, not a bot.

## Corrections to the original manifest

1. **Framing.** "Bypass hostile ATS portals" becomes "assist the human through ATS forms". The manifest's own TASK 04 already routes challenges to a person; this spec makes that the rule, not an exception.
2. **Browser profile.** The manifest attaches to the personal Chrome data folder with `launchPersistentContext`. Chrome locks a profile that is in use, and Chrome 136 and later refuse remote debugging on the default user-data directory. Use a dedicated profile directory, for example `~/.resumeloop/chrome-profile`, that the candidate signs into once.
3. **Breakpoint.** `pdb.set_trace()` becomes `page.pause()` during development, and in normal runs a blocking human-in-the-loop prompt plus a desktop notification. A debugger hang inside a background or queued run would wait forever with nobody watching.
4. **Upstream readiness.** The manifest states that upstream profile pipelines are fully functional. Today, the BYO-CLI provider seam drives only the `resumeloop generate` CLI (PR #101, not yet merged), the web UI Generate button still uses the older API-key path, and resume-gen's career-brief guards have open tuning decisions. Treat these as dependencies of TASK 05, not blockers for TASK 01 to 04.
5. **Stack.** TypeScript and Zod instead of Python and Pydantic, so the feature reuses ResumeLoop's Playwright dependency, its Zod validation, and the provider seam in `lib/providers/`.

## Components mapped to ResumeLoop

| Manifest component | ResumeLoop home |
|---|---|
| Orchestrator loop | New `lib/apply/loop.ts`: a small state machine (`load` → `match blueprint` → `fill page` → `next` → `review`, with `hitl` and `abort` exits) |
| Web agent (Scout) | Playwright `chromium.launchPersistentContext()` on the dedicated profile directory; headed only |
| Schematic research agent (Mapper) | Prompt run through the active provider (`lib/providers/active-provider.ts`, `spawn.ts`), output parsed with `lib/providers/extract-json.ts` and validated by a Zod schema |
| Profile pipeline interface | The candidate's `profile.json`, the generated resume for the job, and a provider call for free-text answers ("Why this company?") |
| Persistent storage | `data/form_blueprints.json` keyed by platform signature; move to the SQLite index only if the JSON file becomes a problem |
| Job input | `lib/jd-parser.ts` already extracts `apply_url` from the job's frontmatter |

## Blueprint schema (TASK 01)

The Zod schema is the contract. Draft shape:

```ts
const Blueprint = z.object({
  platformSignature: z.string(),          // e.g. "workday:<tenant>", "greenhouse:boards"
  platform: z.enum(["workday", "greenhouse", "taleo", "unique"]),
  formKind: z.enum(["flat", "multi_step_wizard"]),
  pages: z.array(z.object({
    fields: z.record(z.string(), z.string()), // logical field -> selector
    resumeDropzone: z.string().nullable(),
    next: z.string().nullable(),              // Next or Continue control
    repeaters: z.array(z.object({
      section: z.string(),                    // "work_history", "education"
      addRowTrigger: z.string(),
      maxRows: z.number().int().max(10),
    })),
  })),
  capturedAt: z.string(),
  confidence: z.number().min(0).max(1),
});
```

Acceptance: the schema rejects a blueprint with no pages, and a blueprint that names a submit control as `next` on the last page.

## Mapper prompt (TASK 02)

Keep the manifest's prompt (appendix), changed in three ways: it returns the schema above instead of the flat four-selector object; it is asked for one page at a time, so a wizard is mapped as the human or the loop reaches each page; and its output is accepted only after Zod validation and after every selector resolves to exactly one element on the live page.

Prefer `data-automation-id` selectors on Workday, `name` and `id` attributes on Greenhouse, and role-plus-label locators otherwise.

## Loop guardrails (TASK 03)

- `maxLoops = 3` per page: three attempts without the page changing ends automation for that page.
- `turnTimeoutMs = 20000` per action.
- Repeat detection: hash the visible form DOM after each action; the same hash after an action that should change it counts as a loop.
- Repeaters are filled from a known row count (number of jobs or degrees in the profile), never "until the form stops asking".
- Any guardrail trip moves the state machine to `hitl`, not to retry.

## Human-in-the-loop triggers (TASK 04)

Hand control to the human, with a notification and the reason, when any frame or page text matches `captcha`, `verify`, `challenge`, or a known challenge iframe host; when a required field has no blueprint mapping; when a guardrail trips; and always at the final review step. The human resumes the loop with a key press, or finishes the application by hand.

## Profile bridge (TASK 05)

For each unmapped free-text question, send the question, the job description, and the candidate profile to the active provider and write the answer into the field only after the human sees it. Structured fields (name, email, dates) come straight from `profile.json` without an LLM call. This task depends on the provider seam from PR #101.

## Open questions

1. Where does the review UI live: a terminal prompt in `resumeloop apply <job>`, or a panel in the web UI?
2. Should blueprints be shareable between users (they contain no personal data), or stay local?
3. Is Taleo worth supporting, given how rarely it appears in the jobs corpus?

## Appendix: original manifest (verbatim, 2026-10-26)

```text
[SESSION GOAL]
Build a multi-agent layout-learning automation framework to safely bypass hostile
ATS portals (Workday, Greenhouse, Taleo) by establishing an isolated Research
& Ruleset database, integrating human-in-the-loop (HITL) fallback layers, and
interfacing with an upstream profile-intelligence pipeline.

1. COMPONENT MANIFEST
* ORCHESTRATOR LOOP (Main Loop): Python state machine managing browser execution,
  database checks, and conditional state routing.
* WEB AGENT (The Scout): Playwright/Browser-use layer running under an active,
  authenticated personal Chrome profile session.
* SCHEMATIC RESEARCH AGENT (The Mapper): LLM processing sub-prompts via structured
  JSON / Pydantic parsing. Inspects complex HTML objects to generate DOM blueprints.
* PROFILE PIPELINE INTERFACES: Microservice endpoints providing custom text strings,
  resume extractions, and targeted query generation.
* PERSISTENT STORAGE LAYER: Structured Local database (`form_blueprints.json` or SQLite)
  storing known selector variations categorized by platform signatures.

2. CURRENT SESSION REPORT
* STATE ANALYSIS: Upstream resume/profile curation pipelines are fully functional.
  The bottleneck lies down-funnel in parsing non-standard input trees, nested
  repeater tables, and multi-page workflow logic common in modern enterprise portals.
* RECENT FINDINGS: Standard LLM browser agents break down due to structural blindness
  when dealing with dynamic pagination components, hidden frames, and infinity loops.
* RESOLUTION APPLIED: Abstracted layout mapping out of the core automation agent
  and isolated it into a pre-flight "Research Agent" caching loop.

3. RESEARCH FINDINGS: HOSTILE PORTAL RECONNAISSANCE
* WORKDAY BEHAVIOR SUMMARY: Uses deep layout structures containing generic
  `data-automation-id` tags instead of semantic form names. Submissions rely on
  nested "Add Row" modules (Work History/Education) which frequently cause LLMs to
  hallucinate state boundaries and execute infinite loop triggers.
* GREENHOUSE BEHAVIOR SUMMARY: Generally stable flat-form structures but utilizes
  hidden fields and custom validation regex formulas that reject standard LLM string formatting.
* ANTI-BOT TRIGGER MATRIX: Headless browser configurations reliably fire cloudflare
  v2 / recaptcha payloads. Tracking signals include raw click positioning, mouse trajectories,
  and token consumption rhythms. Bypassed successfully by attaching script to a long-lived,
  personally authenticated native chrome system data folder (`launch_persistent_context`).

4. INITIALIZATION TASK PLAN
* TASK 01: Setup local data workspace schema (`form_blueprints.json`). Ensure
  fields differentiate structural attributes (e.g., standard flat form vs dynamic multi-step wizard).
* TASK 02: Build out the Schema Extractor Prompt using strict structural JSON formatting rules.
  The target prompt must extract selector paths for: Dropzones, Next/Submit arrays,
  and Repeatable Add-Row tables.
* TASK 03: Implement strict processing guardrails within the loop (`max_allowed_loops=3`,
  `turn_timeout=20s`) to instantly step down automated execution if the web agent
  displays iterative looping actions.
* TASK 04: Insert a native interactive debug breakpoint (`import pdb; pdb.set_trace()`)
  triggered whenever an iframe element contains "captcha", "verify", or token-challenge strings.
* TASK 05: Establish the payload communication bridge to pipe target inquiries down to
  the profile intelligence pipeline and write clean string returns back to the field input variables.

RESEARCH PROMPT: SCHEMA GENERATOR (AGENT SEED)
"You are an expert DOM Analysis Engine. Your goal is to map an unknown web form's
HTML source code into a strict, programmatic blueprint. Analyze the provided HTML context
and return a valid JSON object matching the following structure:
{
  "portal_platform": "string (e.g., workday, greenhouse, unique)",
  "selectors": {
    "first_name_field": "string (css/xpath)",
    "last_name_field": "string (css/xpath)",
    "resume_dropzone": "string (css/xpath)",
    "primary_submit_or_next": "string (css/xpath)"
  },
  "repeater_modules": {
    "has_nested_tables": true/false,
    "add_row_trigger": "string (css/xpath or null)",
    "max_safety_limit": 3
  }
}
Do not return any explanations, markdown packaging blocks, or formatting commentary.
Return raw, parsable JSON text only."
```
