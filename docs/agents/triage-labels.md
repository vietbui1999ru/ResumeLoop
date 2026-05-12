# Triage Labels

| Label | Meaning |
|---|---|
| `needs-triage` | Maintainer needs to evaluate priority and scope |
| `needs-info` | Waiting on reporter for clarification or reproduction steps |
| `ready-for-agent` | Fully specified — safe for autonomous agent implementation |
| `ready-for-human` | Requires human judgment, design decisions, or sensitive changes |
| `wontfix` | Acknowledged but will not be actioned |

## What "ready-for-agent" requires

An issue is only `ready-for-agent` when it has:
- Clear acceptance criteria (what done looks like)
- No unresolved design questions
- No cross-cutting concerns that touch auth, crypto, or billing
- No dependency on an external API that hasn't been tested

## What always stays `ready-for-human`

- Changes to `lib/crypto.ts` or `lib/auth.ts`
- DB schema changes that require data migrations on live data
- Changes to the resume generation hard limits (116-char bullet, 76-char tagline)
- Any change that requires testing against a real Obsidian vault
