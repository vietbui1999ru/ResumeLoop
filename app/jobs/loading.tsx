import { Skeleton } from '@/components/Skeleton'

export default function JobsLoading() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header skeleton — identical classes to real header */}
      <div className="sticky top-0 z-10 bg-surface-base border-b border-zinc-800 px-6 pt-4 pb-3 space-y-2.5">
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

      {/* Table skeleton — 8 rows × 8 cols matching real column layout */}
      <div className="px-6 pt-4 pb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-zinc-800">
              <th className="pb-2 pr-3 w-8"><Skeleton className="h-3 w-4" /></th>
              <th className="pb-2 pr-4"><Skeleton className="h-3 w-20" /></th>
              <th className="pb-2 pr-4"><Skeleton className="h-3 w-24" /></th>
              <th className="pb-2 pr-4 w-14"><Skeleton className="h-3 w-8" /></th>
              <th className="pb-2 pr-4 w-28"><Skeleton className="h-3 w-16" /></th>
              <th className="pb-2 pr-4 w-20"><Skeleton className="h-3 w-12" /></th>
              <th className="pb-2 w-20"><Skeleton className="h-3 w-14" /></th>
              <th className="pb-2 w-6" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-800/50">
                {/* Checkbox */}
                <td className="py-3 pr-3">
                  <Skeleton className="h-4 w-4" />
                </td>
                {/* Company */}
                <td className="py-3 pr-4">
                  <Skeleton className="h-4 w-28" />
                </td>
                {/* Role + track badge */}
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16 rounded" />
                  </div>
                </td>
                {/* Fit% */}
                <td className="py-3 pr-4 w-14">
                  <Skeleton className="h-5 w-12 rounded-full" />
                </td>
                {/* Action */}
                <td className="py-2 pr-4 w-28">
                  <Skeleton className="h-7 w-28 rounded" />
                </td>
                {/* Clipped date */}
                <td className="py-3 pr-4 w-20">
                  <Skeleton className="h-4 w-10" />
                </td>
                {/* Resume status */}
                <td className="py-3 w-20">
                  <Skeleton className="h-4 w-8" />
                </td>
                {/* Hide button */}
                <td className="py-3 w-6" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
