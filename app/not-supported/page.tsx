export default function NotSupportedPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="text-4xl">🖥️</div>
        <h1 className="text-lg font-semibold text-zinc-100">Desktop only — for now</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          ResumeLoop is built for desktop browsers. Open it on your computer in
          <span className="text-zinc-200"> Chrome</span> or
          <span className="text-zinc-200"> Edge</span> for the best experience.
        </p>
        <p className="text-xs text-zinc-600">Mobile support is on the roadmap.</p>
      </div>
    </div>
  )
}
