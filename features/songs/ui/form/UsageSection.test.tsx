import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { BRANCH_IDS, branches, getSong, SONG_IDS, users } from '@/fixtures';
import type { AppUser, BranchUsage, Role } from '@/types/domain';
import type { SongFormValue } from './types';
import {
  clearBranchLevel,
  resolveBranchUsage,
  rowErrors,
  setBranchLevel,
  usageEditability,
  usageFromSong,
  UsageSection,
  UsageSectionSkeleton,
  type UsageSectionProps,
} from './UsageSection';

const userWithRole = (role: Role): AppUser => {
  const u = users.find((x) => x.role === role && x.disabledAt === null);
  if (!u) throw new Error(`no ${role} fixture`);
  return u;
};
const contributor = userWithRole('contributor');
const disabledUser = users.find((u) => u.disabledAt !== null) as AppUser;

// 10000 Reasons: SV high, OR high, RF low manual; CO Springs high derived.
const mixed = getSong(SONG_IDS.tenThousandReasons);
const { servant, portland, coSprings, rockford } = BRANCH_IDS;

type Overrides = Partial<Omit<UsageSectionProps, 'value' | 'onChange'>> & {
  initial?: Partial<SongFormValue>;
};

/** Renders the section with real state so interactions compound like in the form. */
function setup({ initial = {}, ...props }: Overrides = {}) {
  const changes: Array<Partial<SongFormValue>> = [];
  function Harness() {
    const [value, setValue] = useState<Partial<SongFormValue>>(initial);
    return (
      <UsageSection
        branches={branches}
        user={contributor}
        {...props}
        value={value}
        onChange={(patch) => {
          changes.push(patch);
          setValue((v) => ({ ...v, ...patch }));
        }}
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  const last = () => changes.at(-1)?.usage;
  return { user, changes, last };
}

const row = (branchId: string) => {
  const el = document.querySelector<HTMLElement>(`li[data-branch-id="${branchId}"]`);
  if (!el) throw new Error(`no row for ${branchId}`);
  return el;
};
const option = (branchId: string, label: string) =>
  within(row(branchId)).getByRole('radio', { name: label });
const checked = (branchId: string) =>
  within(row(branchId))
    .getAllByRole('radio')
    .filter((r) => r.getAttribute('aria-checked') === 'true')
    .map((r) => r.textContent);

describe('pure helpers', () => {
  it('usageFromSong keeps manual rows only', () => {
    expect(usageFromSong(mixed)).toEqual([
      { branchId: servant, level: 'high' },
      { branchId: portland, level: 'high' },
      { branchId: rockford, level: 'low' },
    ]);
  });

  it('setBranchLevel adds or replaces in place; clearBranchLevel removes', () => {
    const start = [{ branchId: servant, level: 'high' as const }];
    expect(setBranchLevel(start, portland, 'rare')).toEqual([
      { branchId: servant, level: 'high' },
      { branchId: portland, level: 'rare' },
    ]);
    expect(setBranchLevel(start, servant, 'none')).toEqual([{ branchId: servant, level: 'none' }]);
    expect(clearBranchLevel(start, servant)).toEqual([]);
    expect(clearBranchLevel(start, portland)).toEqual(start);
  });

  it('resolveBranchUsage: manual overrides derived, else derived, else unset none', () => {
    const saved: BranchUsage[] = mixed.usage;
    expect(resolveBranchUsage(coSprings, [], saved)).toEqual({
      source: 'derived',
      level: 'high',
      derivedLevel: 'high',
    });
    expect(resolveBranchUsage(coSprings, [{ branchId: coSprings, level: 'rare' }], saved)).toEqual({
      source: 'manual',
      level: 'rare',
      derivedLevel: 'high',
    });
    // A stored manual row that's no longer in the form value is not shown as derived.
    expect(resolveBranchUsage(servant, [], saved)).toEqual({
      source: 'unset',
      level: 'none',
      derivedLevel: null,
    });
    expect(resolveBranchUsage(servant, [{ branchId: servant, level: 'low' }])).toEqual({
      source: 'manual',
      level: 'low',
      derivedLevel: null,
    });
  });

  it('usageEditability follows usage:write', () => {
    expect(usageEditability(userWithRole('contributor'))).toEqual({ editable: true });
    expect(usageEditability(userWithRole('music_leader'))).toEqual({ editable: true });
    expect(usageEditability(userWithRole('admin'))).toEqual({ editable: true });
    expect(usageEditability(userWithRole('member'))).toMatchObject({
      editable: false,
      reason: expect.stringMatching(/only contributors/i),
    });
    expect(usageEditability(disabledUser)).toMatchObject({
      editable: false,
      reason: expect.stringMatching(/disabled/i),
    });
    expect(usageEditability(null)).toMatchObject({
      editable: false,
      reason: expect.stringMatching(/sign in/i),
    });
  });

  it('rowErrors maps indexed paths to the entry at that index', () => {
    const usage = [
      { branchId: servant, level: 'high' as const },
      { branchId: portland, level: 'low' as const },
    ];
    const errors = { 'usage.1.level': ['bad'], '0.branchId': ['dup'], usage: ['all'] };
    expect(rowErrors(errors, usage, portland)).toEqual(['bad']);
    expect(rowErrors(errors, usage, servant)).toEqual(['dup']);
    expect(rowErrors(errors, usage, rockford)).toEqual([]);
    expect(rowErrors(undefined, usage, servant)).toEqual([]);
  });
});

describe('UsageSection', () => {
  it('renders a row per branch with four levels; new song shows none, not set', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Branch usage' })).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Usage by branch' })).getAllByRole('listitem'),
    ).toHaveLength(4);
    for (const b of branches) {
      expect(
        within(row(b.id))
          .getAllByRole('radio')
          .map((r) => r.textContent),
      ).toEqual(['High', 'Low', 'Rare', 'None']);
      expect(checked(b.id)).toEqual(['None']);
      expect(within(row(b.id)).getByText('Not set')).toBeTruthy();
      expect(
        within(row(b.id)).getByRole('img', { name: `Added by branch ${b.code}` }),
      ).toBeTruthy();
    }
    expect(screen.queryByText('Derived')).toBeNull();
  });

  it.each(['High', 'Low', 'Rare', 'None'] as const)('sets %s for a branch', async (label) => {
    const { user, last } = setup();
    await user.click(option(portland, label));
    expect(last()).toEqual([{ branchId: portland, level: label.toLowerCase() }]);
    expect(checked(portland)).toEqual([label]);
    expect(within(row(portland)).getByText('Set manually')).toBeTruthy();
  });

  it('keeps other branches when setting one, and replaces rather than duplicates', async () => {
    const { user, last } = setup({ initial: { usage: usageFromSong(mixed) }, saved: mixed.usage });
    await user.click(option(servant, 'Rare'));
    expect(last()).toEqual([
      { branchId: servant, level: 'rare' },
      { branchId: portland, level: 'high' },
      { branchId: rockford, level: 'low' },
    ]);
  });

  it('distinguishes derived values and lets a manual value override them', async () => {
    const { user, last } = setup({ initial: { usage: usageFromSong(mixed) }, saved: mixed.usage });
    const co = row(coSprings);
    expect(co.dataset.source).toBe('derived');
    expect(within(co).getByText('Derived')).toBeTruthy();
    expect(within(co).getByText('Derived: High')).toBeTruthy();
    expect(checked(coSprings)).toEqual(['High']);
    // Manual rows carry no badge.
    expect(within(row(servant)).queryByText('Derived')).toBeNull();
    expect(row(servant).dataset.source).toBe('manual');

    await user.click(option(coSprings, 'Low'));
    expect(last()).toContainEqual({ branchId: coSprings, level: 'low' });
    expect(row(coSprings).dataset.source).toBe('manual');
    expect(within(row(coSprings)).queryByText('Derived')).toBeNull();
    expect(within(row(coSprings)).getByText('Set manually; overrides derived High')).toBeTruthy();
  });

  it('re-choosing the derived level pins it as manual; re-choosing a manual level is a no-op', async () => {
    const { user, last, changes } = setup({
      initial: { usage: usageFromSong(mixed) },
      saved: mixed.usage,
    });
    await user.click(option(coSprings, 'High'));
    expect(last()).toContainEqual({ branchId: coSprings, level: 'high' });
    expect(row(coSprings).dataset.source).toBe('manual');
    const count = changes.length;
    await user.click(option(coSprings, 'High'));
    expect(changes).toHaveLength(count);
    expect(checked(coSprings)).toEqual(['High']);
  });

  it('clears a manual value back to none, or back to the derived value', async () => {
    const { user, last } = setup({ saved: mixed.usage });
    await user.click(option(servant, 'High'));
    await user.click(screen.getByRole('button', { name: 'Clear Servant usage' }));
    expect(last()).toEqual([]);
    expect(checked(servant)).toEqual(['None']);
    expect(within(row(servant)).getByText('Not set')).toBeTruthy();

    await user.click(option(coSprings, 'Rare'));
    await user.click(
      screen.getByRole('button', { name: 'Clear CO Springs usage (back to derived High)' }),
    );
    expect(last()).toEqual([]);
    expect(checked(coSprings)).toEqual(['High']);
    expect(within(row(coSprings)).getByText('Derived')).toBeTruthy();
    expect(screen.getByText('CO Springs usage back to derived High')).toBeTruthy();
  });

  it('hides the clear button for rows without a manual value', () => {
    setup({ saved: mixed.usage });
    expect(screen.queryByRole('button', { name: /Clear/ })).toBeNull();
  });

  it.each([
    ['member', userWithRole('member'), /only contributors/i],
    ['disabled user', disabledUser, /disabled/i],
    ['signed-out visitor', null, /sign in/i],
  ])('is read-only for a %s, with the reason', async (_label, viewer, reason) => {
    const { user, changes } = setup({
      user: viewer,
      initial: { usage: usageFromSong(mixed) },
      saved: mixed.usage,
    });
    const note = screen.getByText(reason);
    for (const b of branches) {
      for (const r of within(row(b.id)).getAllByRole('radio')) {
        expect((r as HTMLButtonElement).disabled).toBe(true);
      }
      const group = within(row(b.id)).getByRole('radiogroup');
      expect(group.getAttribute('aria-describedby')).toContain(note.parentElement?.id);
    }
    // Values still visible, derived still marked.
    expect(checked(servant)).toEqual(['High']);
    expect(within(row(coSprings)).getByText('Derived')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Clear/ })).toBeNull();
    await user.click(option(rockford, 'High'));
    expect(changes).toEqual([]);
  });

  it.each(['contributor', 'music_leader', 'admin'] as const)('is editable for %s', (role) => {
    setup({ user: userWithRole(role) });
    expect(screen.queryByText(/can’t change|only contributors|sign in/i)).toBeNull();
    for (const b of branches) {
      for (const r of within(row(b.id)).getAllByRole('radio')) {
        expect((r as HTMLButtonElement).disabled).toBe(false);
      }
    }
  });

  it('marks the viewer’s own branch', () => {
    setup({ user: contributor });
    expect(within(row(contributor.branchId as string)).getByText('(your branch)')).toBeTruthy();
  });

  it('shows server field errors on the section and on the matching row', () => {
    const usage = usageFromSong(mixed); // [SV, OR, RF]
    setup({
      initial: { usage },
      saved: mixed.usage,
      errors: { usage: ['Could not save usage'], 'usage.2.level': ['Invalid level'] },
    });
    expect(screen.getByText('Could not save usage')).toBeTruthy();
    expect(within(row(rockford)).getByText('Invalid level')).toBeTruthy();
    expect(within(row(servant)).queryByText('Invalid level')).toBeNull();
    const group = within(row(rockford)).getByRole('radiogroup');
    expect(group.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows errors whose index matches no entry at section level', () => {
    setup({ errors: { 'usage.7.level': ['Orphan error'] } });
    expect(screen.getByText('Orphan error')).toBeTruthy();
  });

  it('is keyboard operable: arrows move within a row, Space selects', async () => {
    const { user, last } = setup();
    option(servant, 'None').focus();
    // Roving focus starts on the checked item; ArrowRight wraps from None to High.
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(option(servant, 'High'));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(option(servant, 'Low'));
    await user.keyboard(' ');
    expect(last()).toEqual([{ branchId: servant, level: 'low' }]);
    // Tab reaches the clear button, Enter clears.
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Clear Servant usage' }),
    );
    await user.keyboard('{Enter}');
    expect(last()).toEqual([]);
  });

  it('disables everything while the form is saving', () => {
    setup({ disabled: true, initial: { usage: usageFromSong(mixed) }, saved: mixed.usage });
    const fieldset = screen.getByRole('group', { name: 'Branch usage' }) as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
  });

  it('shows an empty state with no branches', () => {
    setup({ branches: [] });
    expect(screen.getByText(/No branches yet/)).toBeTruthy();
  });

  it('skeleton is announced as loading', () => {
    render(<UsageSectionSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading branch usage' })).toBeTruthy();
  });
});
