import type { Metadata } from 'next';

import { Toaster } from '@/components/ui/sonner';
import { loadAdminThemes } from '@/features/search/server/synonyms';
import { mergeThemes, setThemeSynonyms } from '@/features/themes/server';
import { requirePageUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { can } from '@/lib/permissions';

import { importThemeVocabulary } from './actions';
import { ThemesAdmin } from './ThemesAdmin';

export const metadata: Metadata = { title: 'Themes · Admin' };

/** Admin › Themes (H-02): merge themes and edit their search synonyms. */
export default async function AdminThemesPage() {
  const user = await requirePageUser('/admin/themes');

  if (!can(user, 'theme:merge') || !can(user, 'theme:synonyms')) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm font-medium text-muted-foreground">403</p>
        <h1 className="mt-1 text-xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only music leaders and admins can manage themes. Ask an admin if you need a different
          role.
        </p>
      </div>
    );
  }

  const themes = await loadAdminThemes(getDb());

  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Themes</h1>
      <ThemesAdmin
        themes={themes}
        canImport={can(user, 'theme:create')}
        onMerge={mergeThemes}
        onSetSynonyms={setThemeSynonyms}
        onImport={importThemeVocabulary}
      />
      <Toaster />
    </div>
  );
}
