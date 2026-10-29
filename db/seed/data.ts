/**
 * Seed rows (DB-04), built from `fixtures/` (F-04). Pure: no database access.
 *
 * The fixtures have five users, which don't cover every role in every branch. The seed adds
 * one generated dev user for each missing (branch, role) pair so DB-05 and manual testing can
 * sign in as any role anywhere. Generated users are clearly synthetic (`<role>.<code>@example.com`).
 *
 * Trigger-maintained song columns (chorus_line, verse1_line, composer_names, theme_names,
 * search_vector) are deliberately absent: DB-02's triggers fill them.
 */
import type * as schema from '@/db/schema';
import {
  branches as fixtureBranches,
  composers as fixtureComposers,
  listItems as fixtureListItems,
  lists as fixtureLists,
  songs as fixtureSongs,
  themes as fixtureThemes,
  users as fixtureUsers,
} from '@/fixtures';
import { ROLES } from '@/types/domain';
import type { AppUser, Role } from '@/types/domain';

/** Password for every seeded auth user. Local development only; never use outside a local stack. */
export const DEV_PASSWORD = 'music-app-dev-password';

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert'];

/** Deterministic id for the generated user at `index`, in the fixtures' `20000000-…` range. */
function generatedUserId(index: number): string {
  return `20000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`;
}

const ROLE_LABEL: Record<Role, string> = {
  member: 'Member',
  contributor: 'Contributor',
  music_leader: 'Music leader',
  admin: 'Admin',
};

/** Fixture users plus one generated active user per (branch, role) the fixtures don't cover. */
export function buildUsers(): AppUser[] {
  const covered = new Set(
    fixtureUsers.filter((u) => !u.disabledAt && u.branchId).map((u) => `${u.branchId}:${u.role}`),
  );
  const generated: AppUser[] = [];
  for (const branch of fixtureBranches) {
    for (const role of ROLES) {
      if (covered.has(`${branch.id}:${role}`)) continue;
      generated.push({
        id: generatedUserId(generated.length),
        email: `${role.replace('_', '-')}.${branch.code.toLowerCase()}@example.com`,
        name: `${ROLE_LABEL[role]} ${branch.code}`,
        branchId: branch.id,
        role,
        authProvider: 'password',
        disabledAt: null,
      });
    }
  }
  return [...fixtureUsers, ...generated];
}

export type SeedData = ReturnType<typeof buildSeedData>;

export function buildSeedData() {
  const users = buildUsers();

  const branches: Insert<typeof schema.branches>[] = fixtureBranches.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    ssoGroup: b.ssoGroup,
  }));

  const userRows: Insert<typeof schema.users>[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    branchId: u.branchId,
    role: u.role,
    authProvider: u.authProvider,
    disabledAt: u.disabledAt ? new Date(u.disabledAt) : null,
  }));

  const composers: Insert<typeof schema.composers>[] = fixtureComposers.map((c) => ({
    id: c.id,
    name: c.name,
    popMember: c.popMember,
  }));

  const themes: Insert<typeof schema.themes>[] = fixtureThemes.map((t) => ({
    id: t.id,
    name: t.name,
  }));

  const songs: Insert<typeof schema.songs>[] = fixtureSongs.map((s) => ({
    id: s.id,
    title: s.title,
    altTitles: s.altTitles,
    year: s.year,
    sourceGroup: s.sourceGroup,
    tempoBpm: s.tempoBpm,
    timeSignature: s.timeSignature,
    energyLevel: s.energyLevel,
    energyNotes: s.energyNotes,
    chorusLyrics: s.lyrics.chorus,
    verse1Lyrics: s.lyrics.verse_1,
    verse2Lyrics: s.lyrics.verse_2,
    verse3Lyrics: s.lyrics.verse_3,
    verse4Lyrics: s.lyrics.verse_4,
    verse5Lyrics: s.lyrics.verse_5,
    bridgeLyrics: s.lyrics.bridge,
    arrangement: s.arrangement,
    addedByBranchId: s.addedByBranchId,
    createdBy: s.createdBy,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
  }));

  const songComposers: Insert<typeof schema.songComposers>[] = fixtureSongs.flatMap((s) =>
    s.composers.map((c, i) => ({ songId: s.id, composerId: c.id, sortOrder: i })),
  );

  const songKeys: Insert<typeof schema.songKeys>[] = fixtureSongs.flatMap((s) =>
    s.keys.map((k) => ({
      id: k.id,
      songId: k.songId,
      key: k.key,
      isPrimary: k.isPrimary,
      introChord: k.firstChords.intro,
      verseChord: k.firstChords.verse,
      chorusChord: k.firstChords.chorus,
      bridgeChord: k.firstChords.bridge,
    })),
  );

  const resources: Insert<typeof schema.resources>[] = fixtureSongs.flatMap((s) =>
    s.resources.map((r) => ({
      id: r.id,
      songId: r.songId,
      songKeyId: r.songKeyId,
      kind: r.kind,
      format: r.format,
      label: r.label,
      storagePath: r.storagePath,
      url: r.url,
      sizeBytes: r.sizeBytes,
      mimeType: r.mimeType,
      createdAt: new Date(r.createdAt),
    })),
  );

  const songThemes: Insert<typeof schema.songThemes>[] = fixtureSongs.flatMap((s) =>
    s.themes.map((t) => ({ songId: s.id, themeId: t.theme.id, section: t.section })),
  );

  const branchUsage: Insert<typeof schema.branchUsage>[] = fixtureSongs.flatMap((s) =>
    s.usage.map((u) => ({ songId: s.id, branchId: u.branchId, level: u.level, source: u.source })),
  );

  const lists: Insert<typeof schema.lists>[] = fixtureLists.map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name,
    eventDate: l.eventDate,
    ownerId: l.ownerId,
    branchId: l.branchId,
    createdAt: new Date(l.createdAt),
    updatedAt: new Date(l.updatedAt),
  }));

  const listItems: Insert<typeof schema.listItems>[] = fixtureListItems.map((i) => ({
    id: i.id,
    listId: i.listId,
    songId: i.songId,
    position: i.position,
    overrideKey: i.overrideKey,
    overrideBpm: i.overrideBpm,
    overrideEnergy: i.overrideEnergy,
    resourceId: i.resourceId,
    notes: i.notes,
  }));

  return {
    users,
    branches,
    userRows,
    composers,
    themes,
    songs,
    songComposers,
    songKeys,
    resources,
    songThemes,
    branchUsage,
    lists,
    listItems,
  };
}
