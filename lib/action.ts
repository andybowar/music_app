/**
 * Server-action error handling (contracts/api.md "Core libs").
 *
 * Every server action is wrapped in `withAction`, which runs the action and maps
 * any thrown error onto an `ActionResult` so callers/UI never see a raw throw:
 *   - `ActionError`        → its own code + optional fieldErrors (passed through)
 *   - `ZodError`           → VALIDATION, with per-field messages
 *   - Next.js control flow → rethrown (`redirect()`, `notFound()` must reach Next)
 *   - anything else        → INTERNAL, swallowed + reported via the capture hook
 *     (default: `reportError` from lib/log → structured log + Sentry)
 */

import type { ActionResult, ErrorCode } from '@/types/domain';

import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';

import { reportError } from '@/lib/log';

/** An error an action may throw deliberately; its code is preserved on the result. */
export class ActionError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

// ----- Sentry capture hook ------------------------------------------------------
// By default unknown errors go to `reportError` (lib/log, OPS-02): a structured
// console.error line plus Sentry.captureException (a no-op without a DSN). Tests
// can install their own sink; `null` restores the default.
export type ErrorCapture = (error: unknown, context?: Record<string, unknown>) => void;

const defaultCapture: ErrorCapture = reportError;

let capture: ErrorCapture = defaultCapture;

/** Install the sink that receives unhandled errors; `null` restores the default. */
export function setSentryCapture(fn: ErrorCapture | null): void {
  capture = fn ?? defaultCapture;
}

// ----- Zod mapping --------------------------------------------------------------

function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const byField: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.map((part) => String(part)).join('.') || '(root)';
    (byField[field] ??= []).push(issue.message);
  }
  return byField;
}

/**
 * Wrap a server-action body. Returns a function with the same signature that
 * always resolves to an `ActionResult<T>` instead of rejecting.
 */
export function withAction<A extends unknown[], T>(
  fn: (...args: A) => Promise<T> | T,
): (...args: A) => Promise<ActionResult<T>> {
  return async (...args: A): Promise<ActionResult<T>> => {
    try {
      const data = await fn(...args);
      return { ok: true, data };
    } catch (error) {
      // redirect()/notFound() throw sentinel errors that Next must handle itself.
      unstable_rethrow(error);

      if (error instanceof ActionError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
          },
        };
      }

      if (error instanceof z.ZodError) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: 'Invalid input.',
            fieldErrors: zodFieldErrors(error),
          },
        };
      }

      // Unknown: report but never leak the message to the client/UI.
      capture(error, { handler: 'withAction' });
      return {
        ok: false,
        error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
      };
    }
  };
}
