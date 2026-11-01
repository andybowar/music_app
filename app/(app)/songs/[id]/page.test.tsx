// @vitest-environment node
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SONG_IDS, getSong as fixtureSong, users } from '@/fixtures';
import { SongPage, SongPageError, type SongPageProps } from '@/features/songs/ui/SongPage';
import type { AppUser, Role, SongDetail } from '@/types/domain';

vi.mock('server-only', () => ({}));

const requirePageUser = vi.fn<(next?: string) => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requirePageUser: (next?: string) => requirePageUser(next) }));

const getSong = vi.fn<(id: string) => Promise<SongDetail | null>>();
vi.mock('@/features/songs/server/songs', () => ({ getSong: (id: string) => getSong(id) }));

const getSignedResourceUrl = vi.fn();
vi.mock('@/features/resources/server/files', () => ({ getSignedResourceUrl }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

const { default: SongRoute, generateMetadata } = await import('./page');

const song = fixtureSong(SONG_IDS.thousandHallelujahs);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function userWith(role: Role): AppUser {
  return { ...users[0]!, role, accessStatus: 'approved', disabledAt: null };
}

function findElement<P>(node: ReactNode, type: unknown): ReactElement<P> | null {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as ReactElement<P>;
  const children = (node.props as { children?: ReactNode }).children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement<P>(child, type);
    if (found) return found;
  }
  return null;
}

async function expectNotFound(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ digest: expect.stringContaining('404') });
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePageUser.mockResolvedValue(userWith('member'));
  getSong.mockResolvedValue(song);
});

describe('song page route', () => {
  it('guards the page with the song path as `next`', async () => {
    await SongRoute(params(song.id));
    expect(requirePageUser).toHaveBeenCalledWith(`/songs/${song.id}`);
  });

  it('is a 404 for an unknown or deleted song', async () => {
    getSong.mockResolvedValue(null);
    await expectNotFound(SongRoute(params('40000000-0000-4000-8000-00000000ffff')));
  });

  it('is a 404 for a malformed id (getSong returns null)', async () => {
    getSong.mockResolvedValue(null);
    await expectNotFound(SongRoute(params('not-a-uuid')));
    expect(getSong).toHaveBeenCalledWith('not-a-uuid');
  });

  it('passes member permissions: no edit, no history', async () => {
    const page = await SongRoute(params(song.id));
    const el = findElement<SongPageProps>(page, SongPage);
    expect(el?.props).toMatchObject({ song, canEdit: false, canViewHistory: false });
    expect(el?.props.getSignedResourceUrl).toBe(getSignedResourceUrl);
  });

  it('passes contributor permissions: edit and history', async () => {
    requirePageUser.mockResolvedValue(userWith('contributor'));
    const page = await SongRoute(params(song.id));
    const el = findElement<SongPageProps>(page, SongPage);
    expect(el?.props).toMatchObject({ canEdit: true, canViewHistory: true });
  });

  it('shows the error state when loading fails', async () => {
    const boom = new Error('db down');
    getSong.mockRejectedValue(boom);
    const page = await SongRoute(params(song.id));
    const el = findElement<{ retryHref: string }>(page, SongPageError);
    expect(el?.props.retryHref).toBe(`/songs/${song.id}`);
    expect(reportError).toHaveBeenCalledWith(boom, { handler: 'SongRoute', songId: song.id });
  });

  it('titles the page after the song', async () => {
    expect(await generateMetadata(params(song.id))).toEqual({ title: song.title });
    getSong.mockResolvedValue(null);
    expect(await generateMetadata(params('x'))).toEqual({ title: 'Song not found' });
    getSong.mockRejectedValue(new Error('db down'));
    expect(await generateMetadata(params('y'))).toEqual({ title: 'Song' });
  });
});
