import { Skeleton } from '@/components/Skeleton'

export default function SettingsLoading() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto p-6">
      {/* Page title */}
      <Skeleton className="h-7 w-24" />

      {/* Configured providers list */}
      <div className="border border-border-subtle rounded-lg overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-60" />
            </div>
            <div className="flex gap-1 shrink-0">
              <Skeleton className="h-7 w-20 rounded" />
              <Skeleton className="h-7 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Add provider form */}
      <div className="space-y-3">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-28 rounded" />
      </div>

      {/* Folder settings */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
