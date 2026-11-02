'use server';

/**
 * Server action behind the History tab (LIB-19): `getAuditTrail` wrapped in `withAction`, so a
 * client component gets an `ActionResult` instead of a throw (e.g. FORBIDDEN for members).
 *
 * `server.ts` (and with it the DB client) is imported lazily so client modules, and their unit
 * tests, can import this action reference without pulling server-only code. Permissions and
 * validation all happen in `getAuditTrail`.
 */

import { withAction } from '@/lib/action';
import type { AuditEntry } from '@/types/domain';

/** `getAuditTrail(entity, entityId)` as an action: `ActionResult<AuditEntry[]>`. */
export const loadAuditTrail = withAction(
  async (entity: string, entityId: string): Promise<AuditEntry[]> => {
    const { getAuditTrail } = await import('./server');
    return getAuditTrail(entity, entityId);
  },
);
