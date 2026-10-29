import { branches as fixtureBranches } from '@/fixtures';
import type { ActionResult, BranchUsage, UUID } from '@/types/domain';
import { usageInputSchema, type UsageInput } from '@/types/validation';

export interface FakeUsageApiOptions {
  /** Simulated network latency. */
  delayMs?: number;
  /** Read on every call so the gallery can flip it at runtime. */
  shouldFail?: () => boolean;
}

export interface FakeUsageApi {
  readonly stored: BranchUsage[];
  setBranchUsage(songId: UUID, entries: UsageInput): Promise<ActionResult<void>>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Stand-in for api.md `setBranchUsage(songId, entries)` (LIB-05), applying the replace-all
 * semantics assumed in CR LIB-15-set-branch-usage-semantics: the entries become the song's manual
 * rows, other manual rows are removed, and derived rows are kept unless an entry overrides them.
 */
export function createFakeUsageApi(
  initial: BranchUsage[],
  { delayMs = 300, shouldFail = () => false }: FakeUsageApiOptions = {},
): FakeUsageApi {
  let stored = initial.map((u) => ({ ...u }));
  const codeOf = (id: UUID) => fixtureBranches.find((b) => b.id === id)?.code ?? '??';

  return {
    get stored() {
      return stored;
    },
    async setBranchUsage(_songId, entries) {
      await wait(delayMs);
      const parsed = usageInputSchema.safeParse(entries);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = ['usage', ...issue.path.map(String)].join('.');
          (fieldErrors[key] ??= []).push(issue.message);
        }
        return { ok: false, error: { code: 'VALIDATION', message: 'Invalid usage', fieldErrors } };
      }
      if (shouldFail() && parsed.data.length > 0) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: 'Invalid usage',
            fieldErrors: {
              usage: ['Simulated server error for the whole section'],
              'usage.0.level': ['Simulated server error for this branch'],
            },
          },
        };
      }
      const overridden = new Set(parsed.data.map((e) => e.branchId));
      stored = [
        ...stored.filter((u) => u.source === 'derived' && !overridden.has(u.branchId)),
        ...parsed.data.map((e) => ({
          branchId: e.branchId,
          branchCode: codeOf(e.branchId),
          level: e.level,
          source: 'manual' as const,
        })),
      ];
      return { ok: true, data: undefined };
    },
  };
}
