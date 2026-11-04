/**
 * Admin backlog (ADM-06; REQ-ADM-01, REQ-ADM-02): feature-local types, constants and Zod
 * schemas. Pure (no I/O, no `server-only`), so the server actions, the client UI and the
 * Drizzle schema (`db/schema/backlog.ts`) share one source for the enum values and limits.
 */
import { z } from 'zod';

import type { ActionResult, ISODateTime, UUID } from '@/types/domain';

// ---------- Enums (Postgres `feature_request_kind` / `feature_request_status`) ----------

export const FEATURE_REQUEST_KINDS = ['enhancement', 'change'] as const;
export type FeatureRequestKind = (typeof FEATURE_REQUEST_KINDS)[number];

export const FEATURE_REQUEST_STATUSES = [
  'new',
  'planned',
  'in_progress',
  'done',
  'declined',
] as const;
export type FeatureRequestStatus = (typeof FEATURE_REQUEST_STATUSES)[number];

export const KIND_LABEL: Record<FeatureRequestKind, string> = {
  enhancement: 'Enhancement',
  change: 'Change',
};

export const STATUS_LABEL: Record<FeatureRequestStatus, string> = {
  new: 'New',
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  declined: 'Declined',
};

// ---------- Limits ----------

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 10_000;
export const TODO_NOTES_MAX = 2_000;
export const MAX_IMAGES_PER_REQUEST = 5;
/** 10 MiB, the `admin-attachments` bucket's file-size limit. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export const IMAGE_EXT: Record<ImageMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function isImageMimeType(type: string): type is ImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

// ---------- Entities ----------

export interface AdminTodo {
  id: UUID;
  title: string;
  notes: string | null;
  doneAt: ISODateTime | null;
  doneBy: UUID | null;
  /** Null for to-dos imported from `agent-spec/TODO.md` (ADM-07). */
  createdBy: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FeatureRequest {
  id: UUID;
  kind: FeatureRequestKind;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  createdBy: UUID;
  /** The submitter's display name (null if the user row is gone). */
  createdByName: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  imageCount: number;
}

export interface FeatureRequestImage {
  id: UUID;
  requestId: UUID;
  fileName: string;
  mimeType: ImageMimeType;
  sizeBytes: number;
  createdAt: ISODateTime;
  /** Short-lived signed read URL (SIGNED_URL_TTL_SECONDS). */
  url: string;
}

export interface FeatureRequestDetail extends FeatureRequest {
  images: FeatureRequestImage[];
}

/** What `createRequestImageUpload` returns: where to PUT the file and the pending id to finalize. */
export interface ImageUploadTicket {
  /** Opaque pending image id; pass it to `finalizeRequestImage`. */
  imageId: string;
  uploadUrl: string;
}

// ---------- Zod schemas ----------

const title = z
  .string()
  .trim()
  .min(1, 'Enter a title')
  .max(TITLE_MAX, `Keep the title to ${TITLE_MAX} characters or fewer`);

const todoNotes = z
  .string()
  .trim()
  .max(
    TODO_NOTES_MAX,
    `Keep notes to ${TODO_NOTES_MAX.toLocaleString('en-US')} characters or fewer`,
  )
  .transform((s) => (s === '' ? null : s));

const description = z
  .string()
  .trim()
  .max(
    DESCRIPTION_MAX,
    `Keep the description to ${DESCRIPTION_MAX.toLocaleString('en-US')} characters or fewer`,
  );

export const todoInputSchema = z.object({ title, notes: todoNotes.nullish() }).strict();
export type TodoInput = z.input<typeof todoInputSchema>;

export const todoPatchSchema = z
  .object({ title, notes: todoNotes.nullable(), done: z.boolean() })
  .partial()
  .strict();
export type TodoPatch = z.input<typeof todoPatchSchema>;

export const requestInputSchema = z
  .object({
    kind: z.enum(FEATURE_REQUEST_KINDS, { error: 'Pick a kind' }),
    title,
    description: description.default(''),
  })
  .strict();
export type RequestInput = z.input<typeof requestInputSchema>;

export const requestPatchSchema = z
  .object({
    kind: z.enum(FEATURE_REQUEST_KINDS),
    title,
    description,
    status: z.enum(FEATURE_REQUEST_STATUSES),
  })
  .partial()
  .strict();
export type RequestPatch = z.input<typeof requestPatchSchema>;

export const listRequestsSchema = z
  .object({ status: z.enum(FEATURE_REQUEST_STATUSES).optional() })
  .strict()
  .optional();

export const imageUploadSchema = z
  .object({
    fileName: z.string().trim().min(1, 'The file needs a name').max(255),
    mimeType: z.enum(IMAGE_MIME_TYPES, { error: 'Use a PNG, JPEG, WebP or GIF image' }),
    sizeBytes: z
      .number()
      .int()
      .min(1, 'The file is empty')
      .max(MAX_IMAGE_BYTES, 'Images must be 10 MB or smaller'),
  })
  .strict();
export type ImageUploadInput = z.input<typeof imageUploadSchema>;

// ---------- UI action seams (contracts/ui.md) ----------

export interface TodoActions {
  addTodo(input: TodoInput): Promise<ActionResult<AdminTodo>>;
  updateTodo(id: UUID, patch: TodoPatch): Promise<ActionResult<AdminTodo>>;
  deleteTodo(id: UUID): Promise<ActionResult<void>>;
}

/** Sends the file body to a signed upload URL, reporting progress from 0 to 1. */
export type PutFile = (url: string, file: File, onProgress: (f: number) => void) => Promise<void>;

export interface RequestActions {
  createRequest(input: RequestInput): Promise<ActionResult<FeatureRequest>>;
  updateRequest(id: UUID, patch: RequestPatch): Promise<ActionResult<FeatureRequest>>;
  deleteRequest(id: UUID): Promise<ActionResult<void>>;
  createRequestImageUpload(
    requestId: UUID,
    input: ImageUploadInput,
  ): Promise<ActionResult<ImageUploadTicket>>;
  finalizeRequestImage(imageId: string): Promise<ActionResult<FeatureRequestImage>>;
  deleteRequestImage(imageId: UUID): Promise<ActionResult<void>>;
  putFile: PutFile;
  /** Client navigation; the gallery stubs it. */
  navigate(href: string): void;
}
