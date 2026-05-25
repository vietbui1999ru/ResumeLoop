// Client-safe provider constants — no server-only imports.
// Import here from both client components and lib/user-settings.ts.

export type Provider = 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter' | 'ollama'

export const PROVIDERS: Provider[] = ['anthropic', 'openai', 'google', 'groq', 'openrouter', 'ollama']

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic:  'Anthropic (Claude)',
  openai:     'OpenAI (GPT)',
  google:     'Google (Gemini)',
  groq:       'Groq (Llama / Mixtral)',
  openrouter: 'OpenRouter (all providers)',
  ollama:     'Ollama (local)',
}
