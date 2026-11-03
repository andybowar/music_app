'use client';

import type { ReactNode } from 'react';

import { CurrentListProvider, useCurrentList } from '@/features/lists/ui/CurrentList';
import type { List } from '@/types/domain';

/** `useCurrentList()`, or `null` when no `CurrentListProvider` is above this component. */
function useOptionalCurrentList() {
  try {
    return useCurrentList();
  } catch {
    // reason: useCurrentList throws outside a provider; that only means "none mounted yet".
    return null;
  }
}

export interface CurrentListBoundaryProps {
  /** The current list the server read from the `current_list` cookie. */
  initial: List | null;
  children: ReactNode;
}

/**
 * Makes `useCurrentList()` available to the children. Uses the app shell's
 * `CurrentListProvider` when there is one (LIST-09 adds it to the layout), so a list created
 * here becomes the shell's current list too; until then it mounts its own provider, which
 * keeps the `current_list` cookie in step.
 */
export function CurrentListBoundary({ initial, children }: CurrentListBoundaryProps) {
  const outer = useOptionalCurrentList();
  if (outer) return <>{children}</>;
  return <CurrentListProvider initial={initial}>{children}</CurrentListProvider>;
}
