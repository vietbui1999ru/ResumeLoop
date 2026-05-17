import { Skeleton } from '@/components/Skeleton'

export default function ConfigLoading() {
  return (
    <div className="space-y-8 p-6 max-w-[1400px] mx-auto">
      {/* Profile bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800/40 border border-zinc-700 rounded-lg">
        <Skeleton className="h-4 w-16 shrink-0" />
        <Skeleton className="h-7 w-36 rounded" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-7 w-16 rounded" />
          <Skeleton className="h-7 w-16 rounded" />
        </div>
      </div>

      {/* ProfileEditor two-panel placeholder */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-56" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded" />
            <Skeleton className="h-7 w-14 rounded" />
          </div>
        </div>
        <div
          className="grid grid-cols-[3fr_2fr] border border-zinc-700 rounded-lg overflow-hidden"
          style={{ height: 520 }}
        >
          <div className="border-r border-zinc-700 bg-zinc-900/50" />
          <div className="bg-zinc-950/50" />
        </div>
      </div>

      {/* DocEditor placeholders */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-7 w-14 rounded" />
          </div>
          <div
            className="grid grid-cols-2 border border-zinc-700 rounded-lg overflow-hidden"
            style={{ height: 480 }}
          >
            <div className="border-r border-zinc-700 bg-zinc-900/50" />
            <div className="bg-zinc-950/50" />
          </div>
        </div>
      ))}
    </div>
  )
}
