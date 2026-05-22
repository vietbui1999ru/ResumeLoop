# Issue Tracker

**Platform:** GitHub
**Repository:** See your GitHub remote — `git remote get-url origin`

## Usage

- File issues at the GitHub Issues tab
- Reference issues in commits as `#<number>`
- `ready-for-agent` = fully specified, safe for AFK agent to implement autonomously
- `ready-for-human` = needs human judgment or design work first

## Agent workflow

When picking up a `ready-for-agent` issue:
1. Read issue body and any linked issues in full
2. Read `CONTEXT.md` and any relevant `docs/adr/` entries before touching code
3. Open a draft PR referencing `Closes #<number>` in the description
4. Run `npx tsc --noEmit` and `npx vitest run` before marking PR ready
5. Close issue only after PR is merged
