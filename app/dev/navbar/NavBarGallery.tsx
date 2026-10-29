'use client';

import { useState } from 'react';

import { NavBar, UserMenu } from '@/components/NavBar';
import { BRANCH_IDS, LIST_IDS, getBranch, getList, users } from '@/fixtures';
import type { List, ListType } from '@/types/domain';

const fixtureUser = users[0]!;
const fixtureBranch = getBranch(BRANCH_IDS.servant);
const fixtureList = getList(LIST_IDS.bg41926);

/**
 * UI-02 gallery: the app header with and without a current list. Each preview frame uses
 * `transform` so the mobile tab bar (position: fixed) stays inside its frame. Desktop (≥1280px)
 * shows the full row; resize below 1280px to see the bottom tab bar + "More" overflow.
 */
export function NavBarGallery() {
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) => setLog((prev) => [entry, ...prev].slice(0, 8));

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">NavBar and app shell</h1>
        <p className="text-sm text-muted-foreground">
          UI-02 gallery. Full row at 1280px and wider; bottom tab bar with a More menu below that.
        </p>
      </header>

      <Preview
        title="No current list (Share disabled)"
        currentList={null}
        onCreate={(type) => record(`onCreate('${type}')`)}
        onShare={() => record('onShare() with no list (should never happen)')}
      />
      <Preview
        title={`Current list: ${fixtureList.name}`}
        currentList={fixtureList}
        onCreate={(type) => record(`onCreate('${type}')`)}
        onShare={() => record(`onShare() for “${fixtureList.name}”`)}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Handler calls</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls yet. Use a Create or Share item.</p>
        ) : (
          <ol className="space-y-1 font-mono text-sm" data-testid="handler-log">
            {log.map((entry, i) => (
              <li key={`${i}-${entry}`}>{entry}</li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function Preview({
  title,
  currentList,
  onCreate,
  onShare,
}: {
  title: string;
  currentList: List | null;
  onCreate(type: ListType): void;
  onShare(): void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="relative h-48 [transform:translateZ(0)] overflow-hidden rounded-md border">
        <div className="border-b bg-background">
          <div className="flex h-14 items-center gap-3 px-4 xl:h-16">
            <span className="shrink-0 text-base font-semibold">Worship Library</span>
            <div className="flex min-w-0 flex-1 justify-center">
              <NavBar currentList={currentList} onCreate={onCreate} onShare={onShare} />
            </div>
            <UserMenu
              name={fixtureUser.name}
              email={fixtureUser.email}
              branchName={fixtureBranch.name}
              signOut={async () => {}}
            />
          </div>
        </div>
        <p className="p-4 text-sm text-muted-foreground">Page content</p>
      </div>
    </section>
  );
}
