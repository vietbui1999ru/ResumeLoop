import { Skeleton } from '@/components/Skeleton'

/** Shared skeleton for the jobs table — used in loading.tsx and the inline initialLoading state. */
export function JobsTableSkeleton() {
  return (
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
            <td className="py-3 pr-3"><Skeleton className="h-4 w-4" /></td>
            <td className="py-3 pr-4"><Skeleton className="h-4 w-28" /></td>
            <td className="py-3 pr-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
            </td>
            <td className="py-3 pr-4 w-14"><Skeleton className="h-5 w-12 rounded-full" /></td>
            <td className="py-2 pr-4 w-28"><Skeleton className="h-7 w-28 rounded" /></td>
            <td className="py-3 pr-4 w-20"><Skeleton className="h-4 w-10" /></td>
            <td className="py-3 w-20"><Skeleton className="h-4 w-8" /></td>
            <td className="py-3 w-6" />
          </tr>
        ))}
      </tbody>
    </table>
  )
}
