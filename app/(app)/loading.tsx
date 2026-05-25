import { Skeleton } from '@/components/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-36" />
      </div>

      {/* 2-col chart grid — matches real lg:grid-cols-2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface-card border border-border-default rounded-xl p-4">
          <Skeleton className="h-4 w-44 mb-3" />
          <Skeleton className="h-[260px] w-full rounded-lg" />
        </div>
        <div className="bg-surface-card border border-border-default rounded-xl p-4">
          <Skeleton className="h-4 w-36 mb-3" />
          <Skeleton className="h-[260px] w-full rounded-lg" />
        </div>
      </div>

      {/* Sankey card — matches real card chrome: title + export btn + chart + footer */}
      <div className="bg-surface-card border border-border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-6 w-16 rounded" />
        </div>
        <Skeleton className="h-[280px] w-full rounded-lg" />
        <Skeleton className="h-3 w-3/4 mt-2" />
      </div>

      {/* Output history table card */}
      <div className="bg-surface-card border border-border-default rounded-xl p-4">
        <Skeleton className="h-4 w-44 mb-3" />
        {/* thead */}
        <div className="flex gap-4 pb-2 border-b border-border-default mb-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-16" />
        </div>
        {/* 5 rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-2 border-b border-border-subtle/60">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
