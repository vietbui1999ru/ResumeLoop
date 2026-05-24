# Desktop App (Local AI Injection) — Migration Draft

**Goal:** Ship an independent desktop app that runs ResumeLoop fully offline with user-controlled local AI runtimes (no cloud API key required).

**Non-goals:** mobile app, cloud sync, harness rewrites.

---

## Recommendation (v1)

- **Choose Tauri** for v1 shell (smaller bundle, tighter default permission model, native Rust-side process control).
- Keep the existing Next.js UI as the renderer (desktop wrapper first, no product rewrite).

If team velocity on Rust-side integration becomes a blocker, keep an Electron fallback branch as a contingency.

---

## Provider Injection Architecture

Create a new **Local Provider Manager** in the desktop runtime:

1. **CLI providers (OpenCode CLI, Claude Code CLI, Codex CLI, Gemini CLI, llama.cpp binary)**
   - Spawn subprocess per request/session.
   - Stream stdout/stderr chunks to renderer via typed IPC events.
   - Support cancellation via process termination + timeout.
2. **Ollama provider**
   - Keep HTTP integration, but route through desktop main process to unify auth, retries, and telemetry.
3. **Unified adapter contract**
   - `listModels()`
   - `generateStream(prompt, opts)`
   - `cancel(requestId)`
   - `healthCheck()`

This keeps existing app AI flows mostly unchanged while swapping backend transport per provider.

---

## Desktop App Phases

- [ ] **Phase 0 — Spike + decision record (1 week)**
  - Tauri proof: spawn one CLI tool, stream output to UI, cancel mid-stream.
  - Validate macOS signing/notarization path and Windows installer path.
  - Write ADR for Tauri-vs-Electron final decision.

- [ ] **Phase 1 — Shell + local runtime (2 weeks)**
  - Boot Next.js UI inside Tauri window.
  - Add native filesystem access for jobs/output folders (no browser path sandbox limits).
  - Add secure config store for provider selection + executable paths.

- [ ] **Phase 2 — Provider adapters (2–3 weeks)**
  - Implement adapters for: OpenCode CLI, Claude Code CLI, Codex CLI, Gemini CLI, Ollama, llama.cpp.
  - Add provider health checks and model discovery UI.
  - Add fallback order (user-defined) when a provider fails.

- [ ] **Phase 3 — Streaming + UX hardening (1–2 weeks)**
  - Standardize token/chunk streaming over IPC.
  - Add retry, cancel, timeout, and actionable error mapping.
  - Add offline-first onboarding flow and diagnostics screen.

- [ ] **Phase 4 — Packaging + release (1 week)**
  - Auto-update strategy (Tauri updater with signed artifacts).
  - macOS code-signing + notarization, Windows signing, Linux AppImage/deb.
  - Ship beta channel with crash/log capture opt-in.

---

## Security Model (must-have)

- Renderer never executes shell directly; only typed IPC calls to main process.
- Allowlist executable paths (or require explicit user approval on first run).
- Redact prompts/resume PII from logs by default.
- Sandboxed filesystem scopes configured by explicit folder picks.

---

## Open Grill-Session Questions

1. Tauri vs Electron final decision after Phase 0 benchmark (bundle, cold start, memory, streaming latency).
2. CLI lifecycle model: one process per request vs pooled session per provider.
3. IPC framing: line/chunk/SSE-like event schema for all providers.
4. Auto-update cadence and rollback strategy.
5. macOS notarization ownership (Apple org, cert ops).
6. Long-term: keep wrapper architecture or gradually extract shared core into desktop-native modules.

---

## Acceptance Criteria for this migration epic

- Desktop build works fully offline after model/tool install.
- User can run resume generation with at least one CLI provider and Ollama.
- No cloud API key required for core generation flow.
- Local filesystem paths are selectable and usable end-to-end.
- Streaming, cancel, and error handling are consistent across all local providers.
