import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// A button is a div with classes, so it is written here rather than pulled
// from a library. Anything with keyboard or focus semantics beyond what the
// native element already gives takes its behaviour from Radix -- UI_GUIDE §2.
// Exported so a link that is visually a button can share the styling without
// a <button> pretending to navigate. Signing in is a real navigation -- an
// OAuth redirect cannot be followed by fetch -- so it must be an anchor.
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-token font-medium",
    "transition-colors duration-micro",
    // Part of the quality floor, not decoration: a control that cannot be seen
    // when focused cannot be used from the keyboard.
    // outline-hidden, not outline-none: in Tailwind v4 the latter is
    // `outline-style: none`, which also removes the outline in forced-colors
    // mode, where the ring below is not rendered at all.
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-surface hover:bg-accent/90",
        ghost: "text-ink-muted hover:bg-surface-raised hover:text-ink",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
