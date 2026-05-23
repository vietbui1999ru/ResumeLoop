# ResumeLoop Bug & Feature Sprint — Design Spec
_2026-05-23_

## Scope

Seven parallel workstreams. Wave 1 (independent) → Wave 2 (depends on Wave 1 landing).

---

## Wave 1 — Independent, Parallel Branches

### Issue 1: Firecrawl API Key Save (`fix/firecrawl-save`)
**Root cause (dual):**
1. No explicit Save button — `onBlur` triggers silently with no feedback.
2. `lib/settings.ts:setSetting` has `if (isCloud()) return` — blanket no-op kills ALL keys in ECS, including `firecrawl_key`.

**Fix:**
- In `settings/page.tsx` Firecrawl section: add a "Save" button (same pattern as AI provider "Test & Save"). Remove `onBlur` trigger. Show status toast on success/error.
- In `lib/settings.ts:setSetting`: only skip path validation (`validateSafeDir`) for `*_path` keys; always write to DB for non-path keys. Cloud mode is valid for `firecrawl_key`.

**Model:** Haiku. **Branch:** `fix/firecrawl-save`.

---

### Issue 3: Chat Edits Not Synced to Profile JSON (`fix/profile-data-sync`)
**Root cause:** `app/api/chat/apply/route.ts` calls `updateSessionData()` — updates `resume_sessions` only. Config page reads `resume_profiles`. Tables diverge after first chat edit.

`github/apply/route.ts` already does the right thing: upserts both session + active profile. Chat apply must do the same.

**Fix:** In `chat/apply/route.ts`, after `updateSessionData()`, add:
```ts
const activeProfile = await db.queryOne<{ id: string; data: string }>(
  'SELECT id, data FROM resume_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1',
  [userId],
)
if (activeProfile) {
  // Merge new_content into active profile
  await db.run(
    'UPDATE resume_profiles SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [new_content, activeProfile.id],
  )
}
```

Also verify `_meta` block survives the write (parse → validate → write).

**Model:** Sonnet. **Branch:** `fix/profile-data-sync`.

---

### Issue 7: Profile Harness Before Generation (`feat/profile-harness`)
**Design:** Preflight check in `app/api/generate/route.ts` before the generation pipeline starts.

Minimum viable profile (MVS):
- `contact.name` present and non-empty
- `contact.email` present and non-empty
- `experience[]` has at least 1 entry with at least 1 bullet
- OR `projects[]` has at least 1 entry with at least 1 bullet

Loose harness: if MVS fails, return `{ warning: true, missing: [...], message: "..." }` with HTTP 200 (not 400). Client shows a dismissable warning modal with "Generate anyway" + "Fix profile first" buttons. Only blocks if profile is completely empty `{}` (HTTP 422 in that case).

**Model:** Haiku. **Branch:** `feat/profile-harness`.

---

### Issue 6: PDF Inline Rendering — LibreOffice Pipeline (`feat/pdf-libreoffice`)
**Design:**

**Server:**
1. Dockerfile: add `RUN apt-get install -y libreoffice --no-install-recommends`
2. `lib/pdf-convert.ts`: wrapper around `soffice --headless --convert-to pdf --outdir /tmp <docx>`. Returns PDF `Buffer`.
3. `lib/generate-pipeline.ts`: after DOCX is written, call `pdfConvert(docxPath)` → upload PDF bytes to S3 (cloud) or write to `output_path` (local) → update `jd_outputs.pdf_path`.
4. New route `app/api/jobs/[id]/output/pdf/route.ts`: serves PDF bytes with `Content-Type: application/pdf` (no `Content-Disposition: attachment`).

**Client:**
- `PdfViewer.tsx` already renders in `<iframe>` (correct). Wire it to `/api/jobs/[id]/output/pdf` instead of the download route.
- `JobDetailModal.tsx` PDF panel: if `output.pdf_path` is null (not yet generated), show "Generating PDF…" skeleton while polling, or a "Generate PDF" button.

**Fallback:** if LibreOffice fails, log error, leave `pdf_path` null, show "PDF unavailable — download DOCX instead" in the modal.

**Model:** Sonnet. **Branch:** `feat/pdf-libreoffice`.

---

## Wave 2 — Complex Features (after Wave 1 merges)

### Issue 2: Tour V2 — Full Onboarding Funnel (`feat/tour-v2`)
**Replaces** the current 8-step tour entirely.

**New flow (sequential pages):**
1. `/settings` — Add AI provider (required for generation) + Firecrawl key (optional). Buttons: **Skip** (mark API step done, go to step 2), **Optional** label on Firecrawl. Done with this page → advance.
2. `/account` — Contact details (name, email, phone, location, LinkedIn). Tell user these populate the resume header.
3. `/chat` — Grill agent (see below). GitHub import first, then free-form chat.
4. `/jobs` — Paste JD flow (paste modal larger 1.25×). After generation completes: instruct user to click the job card. Job card modal gets its own mini-tour: JD tab → PDF tab → AI Why tab. Other tabs (cover letter, outreach, case) only surface if user clicks them.
5. `/page` (Dashboard) — First-time tour: show key metrics, pipeline, quick actions.
6. `/config` — First-time tour: JSON editor, profile sections.

**Button system (replaces current Skip + Next):**
- **Skip** → marks current page's steps done, navigates to next page in funnel
- **Later** → dismisses current bubble/step only, stays on page
- **Done / Next** → advances to next step on same page, or if last step on page, navigates to next funnel page

**Prev button:** Tour context stores `history: string[]` (visited step IDs). Prev pops the last ID and shows it again.

**End of funnel:** Show "Tour complete" bubble with "Restart tour" button. `reset()` clears all seenIds and navigates to step 1.

**Per-page restart:** Sidebar gets a "? Tour" button per page that resets only that page's steps.

**Implementation:**
- `TourContext.tsx`: add `back()`, redesign `skipPage()` → `skipToNextPage()`, add `skipStep()` (Later). Add `funnelPages: string[]` ordered array. Store `history` state.
- `TourOverlay.tsx`: add Prev button (disabled if `history.empty`). Rename labels per new button semantics.
- Replace `TOUR_STEPS` array with new step definitions for all 6 pages.
- Dashboard + Config: separate `TOUR_STEPS` slices, triggered by `firstVisit_dashboard` / `firstVisit_config` localStorage flags.

**Grill agent (Issue 2.2):**
- `lib/grill-prompt.ts`: system prompt for first-session chat mode. Asks about work experience, projects, bullets. Uses CLAUDE.md bullet formula constraints. Aggressive follow-up until user gives concrete tech + outcome. Escapable: if user says "skip" or "done", grill mode ends.
- `app/api/chat/route.ts`: detect `is_first_session` flag (set on first chat message from new user). If true, prepend grill system prompt to BASE_SYSTEM_PROMPT.
- `app/(app)/chat/page.tsx`: show "Getting to know your work history" header during grill mode. When grill ends (AI signals completion), transition to normal editing mode.
- GitHub import: shown as a CTA button BEFORE grill starts: "Import from GitHub first → then we'll ask about your work."

**Grill prompt core:**
```
You are a rigorous resume consultant extracting raw material for bullet points. Your goal: collect concrete work experience details that can be shaped into STAR-format bullets (Built A doing B using C, which produced D).

Phase 1: Ask about their most recent job title, company, dates, team size.
Phase 2: For each role, ask: "What did you build or ship?" then drill: "What tech?" "What was the outcome/metric?" "How long did it take?"
Phase 3: Ask about side projects and open source.
Phase 4: Skills inventory.

Rules:
- One question per message. Never ask multiple questions at once.
- When user gives vague answer ("I worked on a backend"), follow up with "What specifically did you build?" — never accept activity-only answers.
- After collecting ≥2 concrete bullets per role, offer to move on.
- When done, call propose_edit to write experience[] to master_resume_data.
```

**Model:** Sonnet. **Branch:** `feat/tour-v2`.

---

### Issues 4+5: Profile Editor Cards + Diff View (`feat/profile-editor-cards`)
**Design:**

**Diff view (Issue 5 — partially built):**
- `ChatDiff.tsx` exists. `handleProposeEdit` generates unified diff. Need to wire into `chat/page.tsx`: when AI returns a `propose_edit` tool call, render `<ChatDiff>` in the message stream.
- Config page: when AI or manual edit produces a new JSON blob, show side-by-side diff before writing.

**Drag cards (Issue 4):**
- Add `@dnd-kit/core` + `@dnd-kit/sortable` (accessible, no pointer events hacks).
- `components/profile/ExperienceCard.tsx`: shows title, company, dates, bullets preview. Drag handle. Include/exclude toggle (stored as `excluded_ids: string[]` in profile metadata).
- `components/profile/ProjectCard.tsx`: same pattern.
- `components/profile/SkillsRow.tsx`: reorderable skill category chips.
- Config page (`/config`) gets two tabs: "Cards" (default) and "JSON (Advanced)". Cards tab = drag UI. JSON tab = current editor.
- Profile `_meta.excluded_ids: string[]` stores which entries to skip in generation.

**AI JSON manipulation via chat:**
- Already works. The `propose_edit` tool writes the full new JSON. With diff view wired in, user sees what changed before accepting.
- The cards UI reads from the same `resume_profiles.data` JSON — so accepting a chat diff immediately reflects in cards.

**Model:** Sonnet. **Branch:** `feat/profile-editor-cards`.

---

## Parallelization Plan

```
Day 1 (launch simultaneously):
  fix/firecrawl-save         → Haiku   → ~30 min
  fix/profile-data-sync      → Sonnet  → ~45 min
  feat/profile-harness       → Haiku   → ~60 min
  feat/pdf-libreoffice       → Sonnet  → ~3 hrs

Day 2 (after Wave 1 merges):
  feat/tour-v2               → Sonnet  → ~6 hrs
  feat/profile-editor-cards  → Sonnet  → ~4 hrs
```

---

## Self-Review

- No contradictions detected between sections.
- `fix/firecrawl-save` must land before `feat/tour-v2` (tour step 1 must show a working Firecrawl save UX).
- `fix/profile-data-sync` must land before `feat/profile-editor-cards` (cards read from profile table).
- PDF pipeline (`feat/pdf-libreoffice`) requires Dockerfile change — verify Docker build doesn't break CI.
- Grill agent system prompt needs to be testable without full onboarding flow (add `?grill=1` query param override for dev).
