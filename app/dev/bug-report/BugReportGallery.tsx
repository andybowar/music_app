'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';
import { newUploadItem } from '@/features/admin/backlog/ui/RequestForm';
import type {
  BugReport,
  BugReportActions,
  BugReportDetail as BugReportDetailData,
  BugReportImage,
} from '@/features/bugs/types';
import {
  BugReportForm,
  BugReportFormView,
  BugReportSuccess,
  type BugReportFormValue,
} from '@/features/bugs/ui/BugReportForm';
import { BugReportDetail } from '@/features/bugs/ui/BugReportDetail';
import { BugReportList } from '@/features/bugs/ui/BugReportList';
import type { UploadItem } from '@/features/bugs/ui/ScreenshotUploader';
import { users } from '@/fixtures';
import type { ActionResult } from '@/types/domain';

// ---------- Generated placeholder images (no real screenshots) ----------

/** A tiny SVG "screenshot" as a data URL: a header bar, a list and an error banner. */
export function placeholderScreenshot(n: number): string {
  const hue = (n * 55 + 200) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
<rect width="320" height="240" fill="hsl(${hue} 20% 97%)"/>
<rect width="320" height="32" fill="hsl(${hue} 25% 82%)"/>
<rect x="16" y="48" width="288" height="18" rx="3" fill="hsl(${hue} 15% 86%)"/>
<rect x="16" y="74" width="288" height="18" rx="3" fill="hsl(${hue} 15% 86%)"/>
<rect x="16" y="100" width="288" height="18" rx="3" fill="hsl(${hue} 15% 86%)"/>
<rect x="16" y="140" width="288" height="40" rx="4" fill="hsl(0 70% 92%)" stroke="hsl(0 60% 60%)"/>
<text x="160" y="165" font-family="sans-serif" font-size="13" text-anchor="middle" fill="hsl(0 50% 35%)">Placeholder screenshot ${n}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A 1×1 PNG File, for upload items. */
function placeholderPng(name: string): File {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

// ---------- Fixtures ----------

const reporter = users.find((u) => u.role === 'member') ?? users[0]!;
const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}T15:00:00.000Z`;
const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

const images = (reportId: string, count: number): BugReportImage[] =>
  Array.from({ length: count }, (_, i) => ({
    id: uuid('a', i + 1),
    reportId,
    fileName: `screenshot-${i + 1}.png`,
    mimeType: 'image/png',
    sizeBytes: 2048,
    createdAt: day(20),
    url: placeholderScreenshot(i + 1),
  }));

const detailId = uuid('b', 1);
export const galleryDetail: BugReportDetailData = {
  id: detailId,
  title: 'The setlist page is blank after adding a song',
  description:
    'I opened the Advent setlist, added a song from the library and came back.\n\nThe page showed only the header until I reloaded.',
  expected: 'The setlist with the new song at the bottom.',
  pagePath: '/lists/00000000-0000-4000-8000-000000000001',
  userAgent: UA,
  viewport: '390x844',
  appVersion: '3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345',
  status: 'confirmed',
  adminNote: 'Thanks! We can reproduce this and are working on a fix.',
  createdBy: reporter.id,
  createdByName: reporter.name,
  createdAt: day(20),
  updatedAt: day(22),
  imageCount: 2,
  images: images(detailId, 2),
};

export const galleryReports: BugReport[] = [
  { ...galleryDetail, imageCount: 2 },
  ...(
    [
      ['Search finds nothing for “joy”', 'new', 0],
      ['The player keeps playing after I close it', 'fixed', 1],
      ['Chords overlap the lyrics on my phone', 'duplicate', 0],
      ['I would like a dark mode', 'wont_fix', 0],
      ['Export to PDF times out', 'new', 3],
    ] as const
  ).map(([title, status, imageCount], i) => ({
    id: uuid('b', i + 2),
    title,
    description: 'What happened (placeholder).',
    expected: null,
    pagePath: '/library',
    userAgent: UA,
    viewport: '390x844',
    appVersion: null,
    status,
    adminNote: null,
    createdBy: reporter.id,
    createdByName: reporter.name,
    createdAt: day(21 + i),
    updatedAt: day(21 + i),
    imageCount,
  })),
];

// ---------- Stubbed actions ----------

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const failure = (message: string) =>
  ({ ok: false, error: { code: 'INTERNAL', message } }) as const satisfies ActionResult<never>;

/**
 * Bug report actions over nothing: uploads tick progress for ~1.5 s; a file whose name
 * contains "fail" fails its first finalize (so Retry succeeds); a title of "limit" is refused
 * as rate limited.
 */
export function fakeBugActions(): BugReportActions {
  const failedOnce = new Set<string>();
  return {
    async createBugReport(input) {
      await delay();
      if (input.title.trim().toLowerCase() === 'limit') {
        return {
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message:
              "You've sent 10 bug reports in the last hour. Please wait a little before sending another. (gallery stub)",
          },
        };
      }
      return {
        ok: true,
        data: {
          ...galleryReports[1]!,
          title: input.title.trim(),
          description: input.description.trim(),
          status: 'new',
          imageCount: 0,
        },
      };
    },
    async updateBugReport(id, patch) {
      await delay();
      const adminNote =
        patch.adminNote === undefined ? galleryDetail.adminNote : patch.adminNote?.trim() || null;
      return {
        ok: true,
        data: { ...galleryDetail, ...patch, adminNote, id } as BugReport,
      };
    },
    async deleteBugReport() {
      await delay();
      return { ok: true, data: undefined };
    },
    async createBugImageUpload(_reportId, input) {
      await delay(100);
      return {
        ok: true,
        data: { pendingId: `pending:${input.fileName}`, uploadUrl: 'about:blank' },
      };
    },
    async finalizeBugImage(pendingId) {
      await delay();
      const name = pendingId.replace('pending:', '');
      if (name.includes('fail') && !failedOnce.has(name)) {
        failedOnce.add(name);
        return failure('The upload check failed (gallery stub). Retry to succeed.');
      }
      return { ok: true, data: { ...images(detailId, 1)[0]!, fileName: name } };
    },
    async deleteBugImage() {
      await delay();
      return { ok: true, data: undefined };
    },
    async putFile(_url, _file, onProgress) {
      for (let i = 1; i <= 10; i++) {
        await delay(150);
        onProgress(i / 10);
      }
    },
    navigate(href) {
      toast.info(`Would open ${href} (gallery stub)`);
    },
  };
}

// ---------- Gallery ----------

const noop = () => {};
const ENVIRONMENT = { userAgent: UA, viewport: '390x844' };
const FILLED: BugReportFormValue = {
  title: 'The setlist page is blank',
  description: 'After adding a song, the setlist showed only its header.',
  expected: '',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function StaticForm({
  items = [],
  value = FILLED,
  notice,
  fieldErrors = {},
  saving = false,
  locked = false,
}: {
  items?: UploadItem[];
  value?: BugReportFormValue;
  notice?: ReactNode;
  fieldErrors?: Record<string, string[]>;
  saving?: boolean;
  locked?: boolean;
}) {
  return (
    <BugReportFormView
      value={value}
      onChange={noop}
      pagePath="/lists/00000000-0000-4000-8000-000000000001"
      environment={ENVIRONMENT}
      fieldErrors={fieldErrors}
      formError={null}
      saving={saving}
      locked={locked}
      items={items}
      rejections={[]}
      notice={notice}
      onSubmit={(e) => e.preventDefault()}
      onAddFiles={noop}
      onRemoveItem={noop}
      onRetryItem={noop}
    />
  );
}

/**
 * Body of `/dev/bug-report` (ADM-08): BugReportForm (every state), BugReportList (reporter and
 * admin, empty and filled) and BugReportDetail (as reporter and as admin), with fixtures,
 * stubbed actions and generated placeholder screenshots.
 */
export function BugReportGallery() {
  const [listEmpty, setListEmpty] = useState(false);
  const actions = useMemo(() => fakeBugActions(), []);

  // Upload items hold Files and object URLs, so build them in the browser only.
  const [items, setItems] = useState<{ uploading: UploadItem[]; failed: UploadItem[] } | null>(
    null,
  );
  useEffect(() => {
    setItems({
      uploading: [
        newUploadItem(placeholderPng('setlist.png'), {
          stage: 'done',
          progress: 1,
          previewUrl: placeholderScreenshot(1),
        }),
        newUploadItem(placeholderPng('after-reload.png'), {
          stage: 'uploading',
          progress: 0.45,
          previewUrl: placeholderScreenshot(2),
        }),
      ],
      failed: [
        newUploadItem(placeholderPng('setlist.png'), {
          stage: 'done',
          progress: 1,
          previewUrl: placeholderScreenshot(1),
        }),
        newUploadItem(placeholderPng('menu-fail.png'), {
          stage: 'failed',
          error: 'The upload was interrupted.',
          previewUrl: placeholderScreenshot(3),
        }),
      ],
    });
  }, []);

  const reports = listEmpty ? [] : galleryReports;

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
      <header className="grid gap-2">
        <h1 className="text-sm font-medium text-muted-foreground">
          ADM-08 · Bug reports with fixtures and stubbed actions
        </h1>
        <p className="text-sm text-muted-foreground">
          Images are generated placeholders. In the interactive form, a file whose name contains
          “fail” fails once (Retry succeeds), and the title “limit” shows the hourly limit.
        </p>
      </header>

      <Section title="Report form (interactive)">
        <BugReportForm pagePath="/library" actions={actions} />
      </Section>

      <Section title="Report form · empty">
        <StaticForm value={{ title: '', description: '', expected: '' }} />
      </Section>

      <Section title="Report form · validation errors">
        <StaticForm
          value={{ title: '', description: '', expected: '' }}
          fieldErrors={{
            title: ['Tell us what went wrong'],
            description: ['Describe what happened'],
          }}
        />
      </Section>

      <Section title="Report form · uploading">
        {items ? <StaticForm items={items.uploading} saving /> : null}
      </Section>

      <Section title="Report form · a failed screenshot">
        {items ? (
          <StaticForm
            items={items.failed}
            locked
            notice={
              <div
                role="alert"
                className="grid gap-2 rounded-md border border-destructive p-3 text-sm"
              >
                <p>
                  Your report was sent, but 1 screenshot didn&apos;t upload. Retry or remove it
                  above.
                </p>
              </div>
            }
          />
        ) : null}
      </Section>

      <Section title="Report form · sent">
        <BugReportSuccess report={galleryDetail} imageCount={2} onReportAnother={noop} />
      </Section>

      <Section title="Report lists">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={listEmpty}
            onChange={(e) => setListEmpty(e.target.checked)}
            className="size-4"
          />
          Empty
        </label>
        <h3 className="text-sm font-medium">Reporter (/bugs)</h3>
        <BugReportList reports={reports} />
        <h3 className="text-sm font-medium">Admin (/admin/bugs)</h3>
        <BugReportList reports={reports} admin />
        <h3 className="text-sm font-medium">Admin dashboard preview (5 newest, no filter)</h3>
        <BugReportList reports={reports} admin limit={5} />
      </Section>

      <Section title="Report detail · as the reporter">
        <BugReportDetail report={galleryDetail} actions={actions} />
      </Section>

      <Section title="Report detail · as an admin">
        <BugReportDetail report={galleryDetail} admin actions={actions} />
      </Section>

      <Toaster />
    </div>
  );
}
