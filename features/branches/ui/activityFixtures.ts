import type { BranchActivity } from '@/features/branches/server';
import { BRANCH_IDS, branches, getBranch, lists, songSummaries } from '@/fixtures';

/**
 * Sample `getBranchActivity()` output built from `fixtures/` for the `/dev/branches` gallery
 * and the view tests: Portland is busy, CO Springs has only recent songs, Rockford is quiet,
 * Servant is the viewer's own branch.
 */
export function sampleActivity(): BranchActivity[] {
  const byName = [...branches].sort((a, b) => a.name.localeCompare(b.name));
  const portland = getBranch(BRANCH_IDS.portland);
  return byName.map((branch): BranchActivity => {
    switch (branch.id) {
      case BRANCH_IDS.portland:
        return {
          branch,
          recentlyAdded: songSummaries.slice(0, 3),
          upcoming: lists
            .filter((l) => l.type === 'setlist')
            .map((l) => ({ ...l, branchId: portland.id, branchCode: portland.code })),
          topSongs: songSummaries.slice(3, 6).map((s, i) => ({ ...s, count: 4 - i })),
        };
      case BRANCH_IDS.coSprings:
        return { branch, recentlyAdded: songSummaries.slice(6, 8), upcoming: [], topSongs: [] };
      case BRANCH_IDS.servant:
        return {
          branch,
          recentlyAdded: songSummaries.slice(8, 9),
          upcoming: [],
          topSongs: [{ ...songSummaries[0]!, count: 2 }],
        };
      default:
        return { branch, recentlyAdded: [], upcoming: [], topSongs: [] };
    }
  });
}
