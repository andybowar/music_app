import { pgEnum } from 'drizzle-orm/pg-core';
import {
  AUTH_PROVIDERS,
  ENERGY_LEVELS,
  LIST_TYPES,
  POP_MEMBER,
  RESOURCE_FORMATS,
  RESOURCE_KINDS,
  ROLES,
  SECTIONS,
  USAGE_LEVELS,
  USAGE_SOURCES,
} from '@/types/domain';
import type { AuditEntry } from '@/types/domain';

// Postgres enums (contracts/schema.md "Extensions & enums"). Values come from the
// constants in types/domain.ts so the DB and the app can't drift apart.
export const roleEnum = pgEnum('role', ROLES);
export const authProviderEnum = pgEnum('auth_provider', AUTH_PROVIDERS);
export const energyLevelEnum = pgEnum('energy_level', ENERGY_LEVELS);
export const lyricSectionEnum = pgEnum('lyric_section', SECTIONS);
export const usageLevelEnum = pgEnum('usage_level', USAGE_LEVELS);
export const usageSourceEnum = pgEnum('usage_source', USAGE_SOURCES);
export const popMemberEnum = pgEnum('pop_member', POP_MEMBER);
export const resourceKindEnum = pgEnum('resource_kind', RESOURCE_KINDS);
export const resourceFormatEnum = pgEnum('resource_format', RESOURCE_FORMATS);
export const listTypeEnum = pgEnum('list_type', LIST_TYPES);

/**
 * types/domain.ts has no array constant for audit actions, only the
 * `AuditEntry['action']` union. The `satisfies` below keeps this list in lockstep
 * with that union: adding or removing a member on either side fails typecheck.
 */
type AuditAction = AuditEntry['action'];
const AUDIT_ACTIONS = ['create', 'update', 'delete'] as const satisfies readonly AuditAction[];
type MissingAuditAction = Exclude<AuditAction, (typeof AUDIT_ACTIONS)[number]>;
const _auditActionsComplete: [MissingAuditAction] extends [never] ? true : never = true;

export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS);
