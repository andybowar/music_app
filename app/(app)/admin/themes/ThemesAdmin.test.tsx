import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AdminTheme, VocabularyImportResult } from '@/features/search/server/synonyms';
import type { ActionResult } from '@/types/domain';

import { parseSynonyms, synonymErrors, ThemesAdmin, type ThemesAdminProps } from './ThemesAdmin';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const glory: AdminTheme = {
  id: '70000000-0000-4000-8000-000000000001',
  name: 'glory',
  synonyms: ['glorious', 'glory of god'],
  songCount: 4,
};
const honor: AdminTheme = {
  id: '70000000-0000-4000-8000-000000000002',
  name: 'honor',
  synonyms: [],
  songCount: 1,
};

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });

function setup(props: Partial<ThemesAdminProps> = {}) {
  const handlers = {
    onMerge: vi.fn(async (): Promise<ActionResult<void>> => ok(undefined)),
    onSetSynonyms: vi.fn(async (): Promise<ActionResult<void>> => ok(undefined)),
    onImport: vi.fn(async (): Promise<ActionResult<VocabularyImportResult>> =>
      ok({ themesCreated: 2, synonymsAdded: 5, skipped: [] }),
    ),
  };
  render(<ThemesAdmin themes={[glory, honor]} canImport {...handlers} {...props} />);
  return { user: userEvent.setup(), ...handlers };
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('parseSynonyms / synonymErrors', () => {
  it('splits on lines and commas, trimming blanks', () => {
    expect(parseSynonyms(' honor ,\n\nglorious\r\n,  ')).toEqual(['honor', 'glorious']);
    expect(parseSynonyms('')).toEqual([]);
  });

  it('prefixes index errors with their entry unless the message names it', () => {
    expect(
      synonymErrors(['a', 'b'], {
        'synonyms.1': ['Too long.'],
        'synonyms.0': ['"a" is a theme. Merge it instead.'],
        themeId: ['Bad id.'],
      }),
    ).toEqual(['b: Too long.', '"a" is a theme. Merge it instead.', 'Bad id.']);
    expect(synonymErrors(['a'], undefined)).toEqual([]);
  });
});

describe('ThemesAdmin', () => {
  it('lists themes with song counts and synonyms', () => {
    setup();
    const list = screen.getByRole('list', { name: 'Synonyms of glory' });
    expect(within(list).getByText('glory of god')).toBeInTheDocument();
    expect(screen.getByText('4 songs')).toBeInTheDocument();
    expect(screen.getByText('1 song')).toBeInTheDocument();
    expect(screen.getByText('No synonyms')).toBeInTheDocument();
    expect(screen.getByText('2 themes')).toBeInTheDocument();
  });

  it('filters by theme name or synonym, with an empty state', async () => {
    const { user } = setup();
    const box = screen.getByLabelText('Find a theme');
    await user.type(box, 'GLORIOUS');
    expect(screen.getByText('glory')).toBeInTheDocument();
    expect(screen.queryByText('honor')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 2 themes')).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, 'zzz');
    expect(screen.getByText(/No themes match/)).toBeInTheDocument();
  });

  it('shows an empty state with no themes', () => {
    setup({ themes: [] });
    expect(screen.getByText(/No themes yet/)).toBeInTheDocument();
  });

  it('hides the import button without theme:create', () => {
    setup({ canImport: false });
    expect(screen.queryByRole('button', { name: /starter vocabulary/i })).not.toBeInTheDocument();
  });

  it('imports the starter vocabulary and refreshes', async () => {
    const { user, onImport } = setup();
    await user.click(screen.getByRole('button', { name: 'Load starter vocabulary' }));
    expect(onImport).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Added 2 themes and 5 synonyms.'),
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it('reports a failed import', async () => {
    const { user } = setup({
      onImport: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'FORBIDDEN' as const, message: 'Not allowed.' },
      })),
    });
    await user.click(screen.getByRole('button', { name: 'Load starter vocabulary' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Not allowed.'));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('edits synonyms with the keyboard and saves the parsed list', async () => {
    const { user, onSetSynonyms } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit synonyms of honor' }));
    const dialog = await screen.findByRole('dialog');
    const box = within(dialog).getByLabelText('Synonyms');
    await user.type(box, 'esteem, respect');
    await user.click(within(dialog).getByRole('button', { name: 'Save synonyms' }));
    expect(onSetSynonyms).toHaveBeenCalledWith(honor.id, ['esteem', 'respect']);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith('Synonyms for honor saved');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('keeps the dialog open and shows server errors', async () => {
    const { user } = setup({
      onSetSynonyms: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'VALIDATION' as const,
          message: 'Some synonyms are already in use.',
          fieldErrors: { 'synonyms.0': ['"glory" is a theme. Merge it instead.'] },
        },
      })),
    });
    await user.click(screen.getByRole('button', { name: 'Edit synonyms of honor' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Synonyms'), 'glory');
    await user.click(within(dialog).getByRole('button', { name: 'Save synonyms' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('"glory" is a theme. Merge it instead.');
    expect(within(dialog).getByLabelText('Synonyms')).toHaveAttribute('aria-invalid', 'true');
  });

  it('merges a theme into the one picked', async () => {
    const { user, onMerge } = setup();
    await user.click(screen.getByRole('button', { name: 'Merge honor into another theme' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Merge' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Pick the theme to keep.');
    expect(onMerge).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByLabelText('Theme to keep'), glory.id);
    await user.click(within(dialog).getByRole('button', { name: 'Merge into glory' }));
    expect(onMerge).toHaveBeenCalledWith(glory.id, honor.id);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Merged honor into glory'));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('cannot merge when there is only one theme', () => {
    setup({ themes: [glory] });
    expect(screen.getByRole('button', { name: 'Merge glory into another theme' })).toBeDisabled();
  });
});
