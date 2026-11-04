import {
  createBugImageUpload,
  createBugReport,
  deleteBugImage,
  deleteBugReport,
  finalizeBugImage,
  updateBugReport,
} from '@/features/bugs/server';
import { defaultPutFile } from '@/features/admin/backlog/ui/requestActions';

import type { BugReportActions } from '../types';

/** The real bug report actions; components add `navigate` from the router. */
export const SERVER_BUG_ACTIONS = {
  createBugReport,
  updateBugReport,
  deleteBugReport,
  createBugImageUpload,
  finalizeBugImage,
  deleteBugImage,
  putFile: defaultPutFile,
} satisfies Omit<BugReportActions, 'navigate'>;
