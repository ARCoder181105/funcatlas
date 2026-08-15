import { cn } from "@/lib/cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // motion-safe: rather than a plain animate-pulse. The shimmer is
      // non-essential motion, so it does not run for a reader who asked for
      // less of it; the placeholder itself still shows. Re-apply this after
      // any `shadcn add --overwrite`.
      className={cn("motion-safe:animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
