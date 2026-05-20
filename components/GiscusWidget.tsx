'use client'
import Giscus from '@giscus/react'

const REPO      = process.env.NEXT_PUBLIC_GISCUS_REPO       // e.g. "vietbui1999ru/ResumeLoop"
const REPO_ID   = process.env.NEXT_PUBLIC_GISCUS_REPO_ID    // from giscus.app
const CATEGORY  = process.env.NEXT_PUBLIC_GISCUS_CATEGORY   // e.g. "Feedback"
const CAT_ID    = process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID // from giscus.app

function SetupInstructions() {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4 text-sm">
      <p className="text-zinc-300 font-medium">Giscus not configured yet.</p>
      <ol className="space-y-2.5 text-xs text-zinc-400 leading-relaxed list-decimal list-inside">
        <li>
          Enable <strong className="text-zinc-200">Discussions</strong> on your GitHub repo
          (Settings → Features → Discussions)
        </li>
        <li>
          Create a <strong className="text-zinc-200">Feedback</strong> discussion category
        </li>
        <li>
          Install the giscus GitHub app:{' '}
          <code className="text-indigo-300 bg-indigo-950/40 px-1 rounded">
            github.com/apps/giscus
          </code>
        </li>
        <li>
          Visit{' '}
          <code className="text-indigo-300 bg-indigo-950/40 px-1 rounded">giscus.app</code>
          {' '}— enter your repo, get <code className="text-zinc-300">repoId</code> and{' '}
          <code className="text-zinc-300">categoryId</code>
        </li>
        <li>
          Add to your <code className="text-zinc-300">.env.local</code>:
          <pre className="mt-1.5 bg-zinc-800 border border-zinc-700 rounded p-3 text-2xs font-mono text-zinc-300 leading-relaxed overflow-x-auto">{`NEXT_PUBLIC_GISCUS_REPO=vietbui1999ru/ResumeLoop
NEXT_PUBLIC_GISCUS_REPO_ID=<paste from giscus.app>
NEXT_PUBLIC_GISCUS_CATEGORY=Feedback
NEXT_PUBLIC_GISCUS_CATEGORY_ID=<paste from giscus.app>`}</pre>
        </li>
        <li>Restart the dev server — the widget appears here automatically.</li>
      </ol>
    </div>
  )
}

export function GiscusWidget() {
  if (!REPO || !REPO_ID || !CAT_ID) return <SetupInstructions />

  return (
    <Giscus
      repo={REPO as `${string}/${string}`}
      repoId={REPO_ID}
      category={CATEGORY ?? 'Feedback'}
      categoryId={CAT_ID}
      mapping="specific"
      term="ResumeLoop Feedback"
      strict="0"
      reactionsEnabled="1"
      emitMetadata="0"
      inputPosition="top"
      theme="dark_dimmed"
      lang="en"
      loading="lazy"
    />
  )
}
