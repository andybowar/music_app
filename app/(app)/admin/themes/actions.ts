'use server';

/**
 * Admin › Themes actions (H-02) that aren't part of the theme API in `features/themes/server.ts`.
 */
import 'server-only';

import {
  applyThemeVocabulary,
  THEME_VOCABULARY_V1,
  type VocabularyImportResult,
} from '@/features/search/server/synonyms';
import { withAction } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { withTx } from '@/lib/db';
import { assertCan } from '@/lib/permissions';

/**
 * Seed the theme vocabulary from `content/themes-v1.json`: adds the themes and synonyms that
 * aren't there yet and changes nothing else, so it is safe to run again. Needs
 * `theme:create` and `theme:synonyms`. The vocabulary is a fixed file, so there is no input
 * to validate.
 */
export const importThemeVocabulary = withAction(async (): Promise<VocabularyImportResult> => {
  const user = await requireUser();
  assertCan(user, 'theme:create');
  assertCan(user, 'theme:synonyms');
  return withTx((tx) => applyThemeVocabulary(tx, user.id, THEME_VOCABULARY_V1));
});
