import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional classes, with later Tailwind utilities beating earlier ones.
 *
 * Plain string joining loses that: `"p-2 p-4"` leaves both in the class list
 * and the winner is whichever Tailwind emitted first, not the one written
 * last. twMerge resolves the conflict, so a caller can override a variant's
 * padding without reaching for `!important`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
