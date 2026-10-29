const cookieGet = vi.fn<(name: string) => { name: string; value: string } | undefined>();

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGet })),
}));

import { CURRENT_LIST_COOKIE, readCurrentListId } from './currentList';

const ID = '11111111-1111-4111-8111-111111111111';

function withCookie(value: string | undefined) {
  cookieGet.mockImplementation((name) =>
    name === CURRENT_LIST_COOKIE && value !== undefined ? { name, value } : undefined,
  );
}

beforeEach(() => {
  cookieGet.mockReset();
});

describe('readCurrentListId', () => {
  it('reads the current_list cookie', async () => {
    expect(CURRENT_LIST_COOKIE).toBe('current_list');
    withCookie(ID);
    await readCurrentListId();
    expect(cookieGet).toHaveBeenCalledWith('current_list');
  });

  it('returns the id when the cookie holds a UUID', async () => {
    withCookie(ID);
    await expect(readCurrentListId()).resolves.toBe(ID);
  });

  it('decodes a URI-encoded value and normalises case', async () => {
    withCookie(encodeURIComponent(ID.toUpperCase()));
    await expect(readCurrentListId()).resolves.toBe(ID);
  });

  it('accepts any 8-4-4-4-12 hex id, like Postgres uuid', async () => {
    withCookie('00000000-0000-0000-0000-000000000000');
    await expect(readCurrentListId()).resolves.toBe('00000000-0000-0000-0000-000000000000');
  });

  it('returns null when the cookie is missing', async () => {
    withCookie(undefined);
    await expect(readCurrentListId()).resolves.toBeNull();
  });

  it.each([
    ['empty', ''],
    ['not a uuid', 'abc'],
    ['too short', '11111111-1111-4111-8111-11111111111'],
    ['trailing junk', `${ID}x`],
    ['non-hex', 'zzzzzzzz-1111-4111-8111-111111111111'],
    ['bad encoding', '%E0%A4%A'],
  ])('returns null for a malformed value (%s)', async (_label, value) => {
    withCookie(value);
    await expect(readCurrentListId()).resolves.toBeNull();
  });
});
