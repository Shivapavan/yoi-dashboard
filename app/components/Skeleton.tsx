/** Content-shaped loading placeholder. Pulse is disabled under prefers-reduced-motion (see globals.css). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
}

/** A row of summary-card skeletons matching the dashboard's metric grid. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-gray-200">
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  )
}

/** A skeleton placeholder shaped like a table with a header row. */
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-3.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
