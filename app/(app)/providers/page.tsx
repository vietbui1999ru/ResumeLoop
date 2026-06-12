import { ProviderPicker } from '@/components/ProviderPicker'

export const metadata = { title: 'AI Provider · ResumeLoop' }

export default function ProvidersPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">AI Provider</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">
        Choose which AI runs locally as the brain. No API key — ResumeLoop drives your
        own installed CLI ({/* */}<code>claude</code>, <code>codex</code>, <code>gemini</code>,{' '}
        <code>opencode</code>) or a local model over HTTP (ollama).
      </p>
      <ProviderPicker />
    </div>
  )
}
