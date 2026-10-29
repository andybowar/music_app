// @vitest-environment node
import { expect, test } from 'vitest';

import { isDevGalleryEnabled } from './devGallery';

test.each([
  [{ VERCEL_ENV: 'production', NODE_ENV: 'production' }, false],
  [{ VERCEL_ENV: 'preview', NODE_ENV: 'production' }, true],
  [{ VERCEL_ENV: 'development', NODE_ENV: 'development' }, true],
  [{ NODE_ENV: 'production' }, true],
  [{ NODE_ENV: 'development' }, true],
] as const)('%o → %s', (env, expected) => {
  expect(isDevGalleryEnabled(env as NodeJS.ProcessEnv)).toBe(expected);
});
