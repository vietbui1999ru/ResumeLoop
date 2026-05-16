import { Skeleton } from '@/components/Skeleton'

export default function ChatLoading() {
  return (
    <div className="flex h-full">
      {/* Sessions sidebar — w-48 matches real sidebar */}
      <div className="w-48 shrink-0 border-r border-zinc-800 p-3 space-y-2">
        {/* "New session" button placeholder */}
        <div className="border border-zinc-700 rounded-lg px-3 py-2 mb-3">
          <Skeleton className="h-4 w-24 mx-auto" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 p-4 gap-4">
        {/* Tab bar */}
        <div className="flex gap-2 border-b border-zinc-800 pb-2">
          <Skeleton className="h-7 w-14 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>

        {/* Message bubbles */}
        <div className="flex-1 space-y-4 pt-2">
          <div className="flex justify-end">
            <Skeleton className="h-9 w-48 rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-16 w-64 rounded-2xl" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-9 w-32 rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-24 w-72 rounded-2xl" />
          </div>
        </div>

        {/* Input area */}
        <Skeleton className="h-12 w-full rounded-lg shrink-0" />
      </div>
    </div>
  )
}
