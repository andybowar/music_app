// @vitest-environment node
import { expect, test, vi } from 'vitest';

import { notFound, redirect } from 'next/navigation';

import { ActionError, setSentryCapture, withAction } from './action';
import { z } from 'zod';

test('success resolves to ok:true with the function data', async () => {
  await expect(withAction(async () => 5)()).resolves.toEqual({ ok: true, data: 5 });
  await expect(withAction(() => 'hi')()).resolves.toEqual({ ok: true, data: 'hi' });
});

test('ActionError passes through its code, message and fieldErrors', async () => {
  const result = await withAction(() => {
    throw new ActionError('FORBIDDEN', 'nope', { email: ['required'] });
  })();

  expect(result).toEqual({
    ok: false,
    error: { code: 'FORBIDDEN', message: 'nope', fieldErrors: { email: ['required'] } },
  });
});

test('ActionError without fieldErrors omits the fieldErrors key', async () => {
  const result = await withAction(() => {
    throw new ActionError('NOT_FOUND', 'missing');
  })();

  expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'missing' } });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).not.toHaveProperty('fieldErrors');
});

test('ZodError maps to VALIDATION with per-field messages', async () => {
  const result = await withAction(() => {
    z.object({ email: z.string().email(), age: z.number() }).parse({ email: 7, age: 'x' });
    return 1;
  })();

  if (!result.ok) {
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.fieldErrors).toEqual({
      email: [expect.any(String)],
      age: [expect.stringMatching(/received string/i)],
    });
  } else {
    throw new Error('expected a validation failure');
  }
});

test('unknown errors map to INTERNAL and are reported to the capture hook', async () => {
  const bomb = new Error('secret internal detail');
  const capture = vi.fn();
  setSentryCapture(capture);
  try {
    const result = await withAction(async () => {
      throw bomb;
    })();

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    expect(capture).toHaveBeenCalledWith(bomb, expect.objectContaining({ handler: 'withAction' }));
  } finally {
    setSentryCapture(null);
  }
});

test('clearing the capture hook stops reporting to it and falls back to console.error', async () => {
  const capture = vi.fn();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  setSentryCapture(capture);
  const wrapped = withAction(async () => {
    throw new Error('x');
  });
  setSentryCapture(null); // clear before the call runs

  try {
    await wrapped();
    expect(capture).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
  } finally {
    consoleError.mockRestore();
  }
});

test('the default capture hook logs and still resolves to INTERNAL', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  setSentryCapture(null);
  try {
    await expect(
      withAction(async () => {
        throw new Error('x');
      })(),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    expect(consoleError).toHaveBeenCalledOnce();
  } finally {
    consoleError.mockRestore();
  }
});

test.each([
  ['redirect()', () => redirect('/library')],
  ['notFound()', () => notFound()],
])('%s propagates to Next instead of becoming an ActionResult', async (_name, control) => {
  const capture = vi.fn();
  setSentryCapture(capture);
  try {
    const thrown = await withAction(async () => {
      control();
    })().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toHaveProperty('digest');
    expect(capture).not.toHaveBeenCalled();
  } finally {
    setSentryCapture(null);
  }
});
