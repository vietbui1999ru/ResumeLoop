# ADR 0002 — Drop the web UI; ship a CLI and an Electron desktop app

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Quoc-Viet Bui
- **Supersedes in part:** [ADR 0001](0001-pivot-to-local-first.md) decisions 1 (UI wiring), 4 (hosted demo), 7 (Ink TUI) and 11 (distribution). The other ADR 0001 decisions stand.

## Context

ADR 0001 kept a local Next.js web UI as ResumeLoop's interactive surface. Five months on, the code shows two worlds coexisting:

- **Local-first engine (the keeper).** This is `lib/providers/` (CLI adapter, fenced JSON, Zod validation, one retry), `lib/workspace/` (files canonical, `.cache/index.db` rebuildable), `pipeline/buildv2.js` (DOCX) and `lib/pdf-render.ts` (PDF). The CLI in `bin/resumeloop.ts` (`init`, `onboard`, `import`, `generate`, `reindex`) is the only consumer that uses it end to end.
- **Cloud-era web app.** This has 58 API routes and 47 call `auth()`. A second database, `.cache/resume.db`, is the source of truth for jobs and profiles. 12 modules call model SDKs through `lib/ai-client.ts` `getModel()` with stored API keys. There is also a NeonAdapter, demo seeding and DEMO_PUBLIC hardening. None of it uses the provider seam.

Finishing ADR 0001 decision 6 (delete auth and tenancy) would mean rewriting most of the web app anyway. The maintainer has decided the browser is no longer the target surface: ResumeLoop will be a **CLI plus a native desktop app**.

## Decision

### 1. Shell: Electron

The engine is Node/TypeScript all the way down: `child_process` provider spawns, `docx`, `better-sqlite3` and Playwright. Electron runs that engine **in-process in the main process** with no rewrite and no second runtime.

Tauri was rejected. It would need either a bundled Node sidecar (two runtimes plus an IPC bridge) or a Rust port of `lib/providers` (the direction of closed PR #43). A Rust port duplicates the brain seam and lets the CLI and the desktop drift apart. The cost of Electron, a binary of 100 MB or more, is accepted.

### 2. UI: a fresh electron-vite + React + Tailwind app, ported selectively

The renderer is a new React 18 app built with electron-vite and Tailwind, keeping the existing design tokens.

Components are ported one by one from the `v1.1-web-final` tag: the job detail panels, the `react-pdf` preview and the profile editor. Every `fetch('/api/...')` call is replaced by a typed IPC client.

There is **no `/api` route emulation**. The IPC surface is designed per use case (about 15 channels, for example `jobs.list`, `jobs.add`, `generate.run` and `provider.set`), not mirrored from the 58 cloud routes.

### 3. Layout: a `lib/engine` facade, with `desktop/` as a sibling package

`lib/engine/index.ts` becomes the single public engine API: `workspace`, `onboard`, `importCv`, `jobs`, `generate`, `providers`, `profile`.

- `bin/resumeloop.ts` (through `lib/cli/*` handlers) and `desktop/` (Electron main) both call **only** the facade.
- `desktop/` has its own `package.json` for the Electron dependencies and bundles `../lib`.
- There are no npm workspaces for now. If the engine needs to be published separately later, it can be split into a package then.

### 4. PDF: a `PdfRenderer` interface

`renderPdf(html): Promise<Buffer>` sits behind an interface:

- The desktop implementation uses a hidden `BrowserWindow` + `webContents.printToPDF`. Electron already ships Chromium, so there is no Playwright download.
- The CLI keeps the Playwright implementation.
- Both render the same HTML template.

### 5. JD intake: paste or plain fetch; Firecrawl dropped

`engine.jobs.add({ text } | { url })` writes `data/jobs/<slug>.md` with frontmatter, and the CLI exposes it as `resumeloop add`.

A URL is fetched with plain `fetch` and converted from HTML to markdown. If that fails, for example on a JavaScript-rendered job board, the user is asked to paste the text instead. Firecrawl, together with its axios/form-data dependency chain, is removed. Fetching through a rendered browser can come later together with apply-assist (#102).

### 6. The web UI is removed now, before the desktop exists

The Next.js app is deleted in one step:

- `app/`, `components/`, `middleware.ts` and the auth config
- the cloud and DB libraries
- the SDK-path features: outreach, cover letter, application case, chat, and URL/GitHub ingest
- the DEMO_PUBLIC infrastructure and the Docker files

Everything removed stays recoverable from the tag **`v1.1-web-final`**. During the gap the CLI is the only interface. The SDK-path features return later on the provider seam when the desktop needs them.

This also completes ADR 0001 decision 6: no auth, no `user_id`, no second database. The hosted demo (ADR 0001 decision 4) is retired.

### 7. Desktop MVP scope

The MVP has five views, all built on engine functions that already exist or are small additions:

1. Workspace pick, then onboarding and CV import
2. Provider picker
3. JD inbox (paste or URL)
4. Job detail: fit score, generate, DOCX/PDF preview, reveal in Finder
5. Profile editor (`data/profile.json`)

These are deferred: outreach, cover letter, chat, the kanban board, the evaluations dashboard and apply-assist.

### 8. Packaging: macOS arm64, unsigned, no auto-update

- electron-builder produces an ad-hoc-signed dmg, published on GitHub Releases. The user opens it with right-click → Open.
- A Linux AppImage comes next, and Windows later.
- Notarization (a paid Apple Developer account) and `electron-updater` are deferred until there are outside users.

### 9. The Ink TUI is dropped

The desktop app covers the interactive surface, and the CLI covers scripting and headless use. ADR 0001 decision 7 is withdrawn.

## What survives from ADR 0001

These decisions stand unchanged:

- Decision 2: files are canonical and the SQLite index is rebuildable.
- Decision 3: fenced JSON, Zod and one retry.
- Decision 5: `docx` and Playwright, with no LibreOffice. The desktop adds `printToPDF` per decision 4 above.
- Decision 8: hybrid onboarding.
- Decision 9: the split between engine and data.
- Decision 10: the cloud app stays frozen on `legacy/cloud-v1`.

Decision 6 (delete auth) is completed by this ADR. Decisions 1, 4, 7 and 11 are superseded as described above.

## Sequencing

Each step is its own spec, in spec-loop format, approved before implementation.

1. **web-out (S3)**
   - Tag `v1.1-web-final`.
   - Delete the web app, the cloud libraries and the SDK-path features, along with their dependencies (next, next-auth, `@ai-sdk/*`, ai, openai, `@anthropic-ai/sdk`, neon, aws-sdk, upstash, resend, bcryptjs, firecrawl).
   - Running `resumeloop` with no arguments prints help.
   - Move the cloud and web docs to `docs/legacy/`.
2. **engine facade + testable CLI**
   - Add `lib/engine` and `lib/cli/*` with injected I/O.
   - Add `resumeloop add`.
   - Remove the generate-path duplicates, which S2 already planned.
3. **desktop MVP (S4)**
   - Scaffold `desktop/` and the IPC API.
   - Build the five views.
   - Add the `PdfRenderer` interface.
   - Add Playwright `_electron` smoke tests.
   - Produce a dmg in CI.
4. **re-add features on the seam (S1)**
   - Add a text/stream mode to `ProviderAdapter`.
   - Bring back outreach and cover letter as engine functions, then as desktop views.

## Consequences

- There is a temporary GUI gap between steps 1 and 3; the CLI covers the core flow.
- The dependency surface shrinks drastically. Most of the `npm audit` exposure (next, next-auth, axios) disappears with the web app.
- The CLI and the desktop cannot diverge because they share the facade. The facade's types become the IPC contract.
- The cost is a large binary and Electron security hygiene: `contextIsolation`, no `nodeIntegration` in the renderer, and a preload exposing only the typed API.
- E2E tests move from Next and Playwright browser specs to Playwright's Electron driver.

## Alternatives considered

- **Tauri with a Node sidecar.** Rejected: it needs two runtimes and SEA bundling with native modules (`better-sqlite3`).
- **Tauri with a Rust engine (PR #43).** Rejected: it means rewriting the provider seam and drifting from the CLI.
- **Running the Next server inside Electron.** Rejected: it keeps the whole web and cloud surface just to put it in a window.
- **Keeping the web UI until the desktop reached parity.** Rejected by the maintainer, who prefers a smaller codebase to build the desktop against.
- **Ink TUI.** Dropped: the desktop and CLI cover its scope.
