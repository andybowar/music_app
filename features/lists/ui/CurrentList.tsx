'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { List, UUID } from '@/types/domain';

/**
 * Session's current list (REQ-LIST-01, REQ-NAV-04).
 *
 * Persistence: cookie `current_list` holding only the list id, 12 h max-age, set from
 * the browser. The server resolves that id to a `List` (via `readCurrentListId()`, see
 * change request LIST-04-server-helper) and passes it in as `initial`, so the first
 * render is identical on server and client. If the server finds no such list (deleted,
 * or no longer visible) it passes `null`, and the provider clears the stale cookie.
 */

const COOKIE_NAME = 'current_list';
const MAX_AGE_SECONDS = 12 * 60 * 60;

export interface CurrentListContextValue {
  current: List | null;
  setCurrent(list: List | null): void;
}

export interface CurrentListProviderProps {
  initial: List | null;
  children: ReactNode;
}

const CurrentListContext = createContext<CurrentListContextValue | null>(null);

function readCookieId(): string | null {
  try {
    if (typeof document === 'undefined') return null;
    for (const part of document.cookie.split(';')) {
      const [rawName, ...rest] = part.trim().split('=');
      if (rawName === COOKIE_NAME) {
        const value = decodeURIComponent(rest.join('='));
        return value === '' ? null : value;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function writeCookieId(id: UUID | null): void {
  try {
    if (typeof document === 'undefined') return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      id === null
        ? `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
        : `${COOKIE_NAME}=${encodeURIComponent(id)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    // Cookies blocked: the current list still works for this page view.
  }
}

export function CurrentListProvider({ initial, children }: CurrentListProviderProps) {
  const [current, setCurrentState] = useState<List | null>(initial);
  const [prevInitial, setPrevInitial] = useState<List | null>(initial);

  // A new `initial` from the server (navigation / router.refresh, e.g. after the
  // list was deleted) replaces local state. Adjusting state during render avoids an
  // extra paint compared with doing it in an effect.
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setCurrentState(initial);
  }

  // Keep the cookie in step with state. Only writes when the id differs, so the 12 h
  // expiry runs from when the list was chosen rather than sliding on every page view.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (readCookieId() !== currentId) writeCookieId(currentId);
  }, [currentId]);

  const setCurrent = useCallback((list: List | null) => {
    setCurrentState(list);
  }, []);

  const value = useMemo<CurrentListContextValue>(
    () => ({ current, setCurrent }),
    [current, setCurrent],
  );

  return <CurrentListContext.Provider value={value}>{children}</CurrentListContext.Provider>;
}

export function useCurrentList(): CurrentListContextValue {
  const ctx = useContext(CurrentListContext);
  if (ctx === null) {
    throw new Error('useCurrentList must be used inside <CurrentListProvider>.');
  }
  return ctx;
}
