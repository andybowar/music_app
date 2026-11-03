import { describe, expect, it } from 'vitest';

import {
  imageUploadSchema,
  isImageMimeType,
  MAX_IMAGE_BYTES,
  requestInputSchema,
  requestPatchSchema,
  todoInputSchema,
  todoPatchSchema,
} from './types';

const chars = (n: number) => 'x'.repeat(n);

describe('to-do schemas', () => {
  it('trims the title and needs 1–200 characters', () => {
    expect(todoInputSchema.parse({ title: '  Fix  ' })).toEqual({ title: 'Fix' });
    expect(todoInputSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(todoInputSchema.safeParse({ title: chars(200) }).success).toBe(true);
    expect(todoInputSchema.safeParse({ title: chars(201) }).success).toBe(false);
  });

  it('caps notes at 2,000 characters and turns blank notes into null', () => {
    expect(todoInputSchema.parse({ title: 'a', notes: '  ' }).notes).toBeNull();
    expect(todoInputSchema.safeParse({ title: 'a', notes: chars(2000) }).success).toBe(true);
    expect(todoInputSchema.safeParse({ title: 'a', notes: chars(2001) }).success).toBe(false);
  });

  it('patches are partial and strict', () => {
    expect(todoPatchSchema.parse({ done: true })).toEqual({ done: true });
    expect(todoPatchSchema.parse({ notes: null })).toEqual({ notes: null });
    expect(todoPatchSchema.safeParse({ doneBy: 'me' }).success).toBe(false);
  });
});

describe('request schemas', () => {
  it('needs a kind and a 1–200 character title; description defaults to empty', () => {
    expect(requestInputSchema.parse({ kind: 'change', title: ' T ' })).toEqual({
      kind: 'change',
      title: 'T',
      description: '',
    });
    expect(requestInputSchema.safeParse({ kind: 'bug', title: 'T' }).success).toBe(false);
    expect(requestInputSchema.safeParse({ kind: 'change', title: '' }).success).toBe(false);
    expect(requestInputSchema.safeParse({ kind: 'change', title: chars(201) }).success).toBe(false);
  });

  it('caps the description at 10,000 characters', () => {
    const base = { kind: 'enhancement', title: 'T' } as const;
    expect(requestInputSchema.safeParse({ ...base, description: chars(10_000) }).success).toBe(
      true,
    );
    const over = requestInputSchema.safeParse({ ...base, description: chars(10_001) });
    expect(over.success).toBe(false);
    expect(over.error?.issues[0]?.message).toMatch(/10,000/);
  });

  it('patches accept any status and reject unknown fields', () => {
    expect(requestPatchSchema.parse({ status: 'in_progress' })).toEqual({ status: 'in_progress' });
    expect(requestPatchSchema.safeParse({ status: 'closed' }).success).toBe(false);
    expect(requestPatchSchema.safeParse({ createdBy: 'x' }).success).toBe(false);
  });
});

describe('image upload schema', () => {
  const ok = { fileName: 'a.png', mimeType: 'image/png', sizeBytes: 10 } as const;

  it('accepts the four image types up to 10 MiB', () => {
    for (const mimeType of ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const) {
      expect(imageUploadSchema.safeParse({ ...ok, mimeType }).success).toBe(true);
    }
    expect(imageUploadSchema.safeParse({ ...ok, sizeBytes: MAX_IMAGE_BYTES }).success).toBe(true);
  });

  it('rejects other types, empty files and files over 10 MiB', () => {
    expect(imageUploadSchema.safeParse({ ...ok, mimeType: 'image/svg+xml' }).success).toBe(false);
    expect(imageUploadSchema.safeParse({ ...ok, sizeBytes: 0 }).success).toBe(false);
    expect(imageUploadSchema.safeParse({ ...ok, sizeBytes: MAX_IMAGE_BYTES + 1 }).success).toBe(
      false,
    );
  });

  it('isImageMimeType', () => {
    expect(isImageMimeType('image/webp')).toBe(true);
    expect(isImageMimeType('application/pdf')).toBe(false);
  });
});
