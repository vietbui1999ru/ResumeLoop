import { Skeleton } from '@/components/Skeleton'
import { JobsTableSkeleton } from '@/components/JobsTableSkeleton'

export default function JobsLoading() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header skeleton — identical classes to real header */}
      <div className="sticky top-0 z-10 bg-surface-base border-b border-border-subtle px-6 pt-4 pb-3 space-y-2.5">
        {/* Row 1: title + session switcher + scan */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-28 rounded-md" />
          <div className="ml-auto">
            <Skeleton className="h-8 w-16 rounded" />
          </div>
        </div>
        {/* Row 2: search + action select + fit + visa */}
        <div className="flex items-center gap-2">
          <Skeleton className="flex-1 h-8 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg shrink-0" />
          <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
          <Skeleton className="h-8 w-20 rounded-lg shrink-0" />
        </div>
      </div>

      <div className="px-6 pt-4 pb-6">
        <JobsTableSkeleton />
      </div>
    </div>
  )
}
