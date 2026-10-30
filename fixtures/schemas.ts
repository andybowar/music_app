/**
 * Strict Zod mirrors of the domain entities, used only to type and check the JSON fixtures.
 * `resolveJsonModule` widens JSON literals to `string`, so the JSON is parsed through these
 * schemas in `index.ts`; `fixtures.test.ts` asserts each schema's output type equals the
 * domain interface, so a schema can't drift from `@/types/domain`.
 */
import { z } from 'zod';

import {
  ACCESS_STATUSES,
  AUTH_PROVIDERS,
  CHORD_RE,
  CHORD_SLOTS,
  ENERGY_LEVELS,
  LIST_TYPES,
  MUSICAL_KEY_RE,
  POP_MEMBER,
  RESOURCE_FORMATS,
  RESOURCE_KINDS,
  ROLES,
  SECTIONS,
  TIME_SIGNATURE_RE,
  USAGE_LEVELS,
  USAGE_SOURCES,
} from '@/types/domain';
import type { ChordSlot, Section } from '@/types/domain';

const uuid = z.guid();
const isoDateTime = z.iso.datetime();
const musicalKey = z.string().regex(MUSICAL_KEY_RE);
const section = z.enum(SECTIONS);
const energyLevel = z.enum(ENERGY_LEVELS);

export const branchSchema = z.strictObject({
  id: uuid,
  name: z.string().min(1),
  code: z.string().regex(/^[A-Z]{2,3}$/),
  ssoGroup: z.string().nullable(),
});

export const appUserSchema = z.strictObject({
  id: uuid,
  email: z.email(),
  name: z.string().min(1),
  branchId: uuid.nullable(),
  role: z.enum(ROLES),
  authProvider: z.enum(AUTH_PROVIDERS),
  disabledAt: isoDateTime.nullable(),
  accessStatus: z.enum(ACCESS_STATUSES),
});

export const themeSchema = z.strictObject({ id: uuid, name: z.string().min(1).max(60) });

export const composerSchema = z.strictObject({
  id: uuid,
  name: z.string().min(1),
  popMember: z.enum(POP_MEMBER),
});

const chord = z.string().max(12).regex(CHORD_RE);

export const songKeySchema = z.strictObject({
  id: uuid,
  songId: uuid,
  key: musicalKey,
  isPrimary: z.boolean(),
  firstChords: z.strictObject(
    Object.fromEntries(CHORD_SLOTS.map((s) => [s, chord.nullable()])) as {
      [K in ChordSlot]: z.ZodNullable<typeof chord>;
    },
  ),
});

export const resourceSchema = z.strictObject({
  id: uuid,
  songId: uuid,
  songKeyId: uuid.nullable(),
  kind: z.enum(RESOURCE_KINDS),
  format: z.enum(RESOURCE_FORMATS),
  label: z.string().min(1).max(120),
  url: z.url({ protocol: /^https?$/ }).nullable(),
  storagePath: z.string().min(1).nullable(),
  sizeBytes: z.number().int().positive().nullable(),
  mimeType: z.string().min(1).nullable(),
  createdAt: isoDateTime,
});

const lyricsSchema = z.strictObject(
  Object.fromEntries(SECTIONS.map((s) => [s, z.string().max(5000).nullable()])) as {
    [K in Section]: z.ZodNullable<z.ZodString>;
  },
);

export const branchUsageSchema = z.strictObject({
  branchId: uuid,
  branchCode: z.string(),
  level: z.enum(USAGE_LEVELS),
  source: z.enum(USAGE_SOURCES),
});

export const songDetailSchema = z.strictObject({
  id: uuid,
  title: z.string().min(1).max(200),
  year: z.number().int().nullable(),
  tempoBpm: z.number().int().nullable(),
  timeSignature: z.string().regex(TIME_SIGNATURE_RE).nullable(),
  energyLevel: energyLevel.nullable(),
  primaryKey: musicalKey.nullable(),
  composers: z.array(composerSchema),
  addedByBranchCode: z.string().nullable(),
  resourceCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  altTitles: z.array(z.string()),
  sourceGroup: z.string().nullable(),
  energyNotes: z.string().nullable(),
  lyrics: lyricsSchema,
  arrangement: z.array(section),
  chorusLine: z.string().nullable(),
  verse1Line: z.string().nullable(),
  keys: z.array(songKeySchema),
  resources: z.array(resourceSchema),
  themes: z.array(z.strictObject({ section, theme: themeSchema })),
  usage: z.array(branchUsageSchema),
  addedByBranchId: uuid.nullable(),
  createdBy: uuid.nullable(),
  updatedAt: isoDateTime,
});

export const listSchema = z.strictObject({
  id: uuid,
  type: z.enum(LIST_TYPES),
  name: z.string().min(1).max(120),
  eventDate: z.iso.date().nullable(),
  ownerId: uuid,
  ownerName: z.string().min(1),
  branchId: uuid.nullable(),
  branchCode: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const listItemSchema = z.strictObject({
  id: uuid,
  listId: uuid,
  songId: uuid,
  position: z.number().int().nonnegative(),
  overrideKey: musicalKey.nullable(),
  overrideBpm: z.number().int().nullable(),
  overrideEnergy: energyLevel.nullable(),
  resourceId: uuid.nullable(),
  notes: z.string().max(500).nullable(),
});

export const listsFileSchema = z.strictObject({
  lists: z.array(listSchema),
  items: z.array(listItemSchema),
});
