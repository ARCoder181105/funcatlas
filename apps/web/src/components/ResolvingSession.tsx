import { Skeleton } from "./ui/skeleton";

/**
 * The shape of the app, not a spinner (UI_GUIDE §3.3).
 *
 * Its own module because two things need it and they must not import each
 * other: `AppRoute` shows it while the session resolves, and `App` uses it as
 * the Suspense fallback while the route's chunk downloads. Importing it from
 * `AppRoute` would pull that whole chunk -- React Flow included -- back into
 * the main bundle and undo the split.
 *
 * The same skeleton for both is not a shortcut. From the reader's side the two
 * waits are one wait, and swapping one placeholder for another mid-load would
 * show them a seam that means nothing to them.
 */
export function ResolvingSession() {
  return (
    <div className="flex h-full w-full flex-col" aria-busy>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-64 shrink-0 space-y-2 border-r border-surface-border p-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
        <div className="flex-1" />
      </div>
    </div>
  );
}
