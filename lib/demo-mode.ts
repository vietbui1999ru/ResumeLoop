// Public-demo deployment flag (self-hosted homelab, Ollama-only).
// When DEMO_PUBLIC=1: the AI provider is forced to the local Ollama model for every
// session, credential signup is disabled, and demo sessions cannot retarget providers.
// Never set on a box where a real BYOK account needs to work.
export function isDemoPublic(): boolean {
  return process.env.DEMO_PUBLIC === '1'
}
