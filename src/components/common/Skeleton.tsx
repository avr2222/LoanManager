export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 rounded-xl ${className}`} />;
}

/** Generic page placeholder: a KPI-card row, a wide panel and a table block.
 *  Shown while the initial Supabase load is in flight so pages don't flash empty. */
export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-36" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
