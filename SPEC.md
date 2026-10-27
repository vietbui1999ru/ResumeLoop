---
status: draft
branch: docs/adr-0002
---
# SPEC: ADR 0002, drop the web UI and ship a CLI and an Electron desktop app

## Objective
Record the direction change, from a local Next.js web UI to a CLI plus an Electron desktop app, as an accepted ADR. Bring the guidance documents in line with it so that later specs (web-out, engine facade, desktop MVP, seam re-add) build against one direction of record. Success: ADR 0002 is accepted, ADR 0001 is marked superseded in part, and CLAUDE.md, CONTEXT.md and docs/architecture.md all point at ADR 0002 and no longer describe the web UI as the product surface. This branch changes no code.

## Acceptance Criteria
- AC-1: ADR 0002 exists with status Accepted
  verify: `/usr/bin/grep -q '^- \*\*Status:\*\* Accepted' docs/adr/0002-cli-and-electron-desktop.md`
- AC-2: ADR 0002 records all nine numbered decisions
  verify: `test "$(/usr/bin/grep -cE '^### [1-9]\. ' docs/adr/0002-cli-and-electron-desktop.md)" -eq 9`
- AC-3: ADR 0001's header marks it superseded in part by ADR 0002
  verify: `/usr/bin/grep -qE '^- \*\*Superseded in part by:\*\*.*0002-cli-and-electron-desktop' docs/adr/0001-pivot-to-local-first.md`
- AC-4: CLAUDE.md names ADR 0002 as the direction of record
  verify: `/usr/bin/grep -q '0002-cli-and-electron-desktop' CLAUDE.md`
- AC-5: CLAUDE.md no longer documents the web dev server as the way to run the app
  verify: `! /usr/bin/grep -qE 'localhost:3000|npm run dev' CLAUDE.md`
- AC-6: docs/architecture.md references ADR 0002 and the lib/engine facade
  verify: `/usr/bin/grep -q '0002' docs/architecture.md && /usr/bin/grep -q 'lib/engine' docs/architecture.md`
- AC-7: CONTEXT.md defines the new vocabulary (engine facade, desktop app, IPC API)
  verify: `/usr/bin/grep -qi 'engine facade' CONTEXT.md && /usr/bin/grep -qi 'IPC' CONTEXT.md`
- AC-8: The branch changes only documentation (no code, config or package changes)
  verify: `test -z "$(/opt/homebrew/bin/git diff --name-only origin/main...HEAD -- . ':!docs' ':!CLAUDE.md' ':!CONTEXT.md' ':!SPEC.md')"`
- AC-9: The ADR's decisions match what the maintainer chose in the 2026-10-27 grill session (Electron; fresh UI with selective port; lib/engine and desktop/; macOS arm64 unsigned; printToPDF; five-view MVP; web removed now behind the tag v1.1-web-final; paste and fetch JD intake without Firecrawl)
  verify: manual - the maintainer has to judge whether the prose reflects their decisions

## Boundaries
### Always
- Run `~/dotfiles/scripts/ac-run check SPEC.md` before claiming done
- Keep the ADR 0001 body intact; change only its header status lines
### Ask first
- Any edit to code, package.json or workflows (this is a documentation-only spec)
- Moving cloud-era docs into docs/legacy/ (that belongs to the web-out spec)
### Never
- Edit a `verify:` line to make a check pass
- Delete or tag anything; the `v1.1-web-final` tag is created by the web-out spec

## Open Questions
- Should CLAUDE.md keep the web routes and buildv2 sections until web-out lands? Default: keep the engine sections (buildv2, data shapes, hard limits). Replace "Build / test / run" with the CLI commands, and add one line saying the web UI is being removed per ADR 0002.
- What should the desktop app's product name and bundle id be? Default: "ResumeLoop", bundle id `dev.resumeloop.app`. Decided in the desktop MVP spec.
- Where should the desktop app remember the last opened workspace? Default: Electron `app.getPath('userData')/settings.json`; `RESUMELOOP_HOME` still overrides it for the CLI.
- How should the desktop app be E2E tested? Default: Playwright's `_electron.launch` smoke tests, defined in the desktop MVP spec.
- What happens to the `resumeloop.me` domain and the homelab demo? Default: retire both. The domain redirects to the GitHub README.
