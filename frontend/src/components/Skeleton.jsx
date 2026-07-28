export function Skeleton({ className = '', ...props }) {
  return <div className={`animate-shimmer rounded-xl bg-surface-200 ${className}`} {...props} />;
}

export function CardSkeleton({ lines = 3, className = '' }) {
  return (
    <div className={`card p-5 space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="card p-4 flex items-center gap-4">
          <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PricingSkeleton() {
  return (
    <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto animate-fade-in">
      {[1, 2].map(i => (
        <div key={i} className="card p-6 sm:p-8 space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-10 w-24" />
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map(j => (
              <Skeleton key={j} className="h-3 w-full" />
            ))}
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
