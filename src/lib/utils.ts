import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner (shadcn convention). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Build the selection key for a given row/column pair. */
export function cellKey(rowId: string, col: string): string {
  return `${rowId}::${col}`;
}
