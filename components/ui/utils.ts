import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge about the UI-01 theme keys so e.g. `rounded-md rounded-chip` resolves.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['chip'],
      spacing: ['tap'],
    },
  },
});

/** Merge class names; later Tailwind utilities win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
