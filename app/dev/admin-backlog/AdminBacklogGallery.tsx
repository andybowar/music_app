'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';
import type {
  AdminTodo,
  FeatureRequest,
  FeatureRequestDetail,
  FeatureRequestImage,
  RequestActions,
  TodoActions,
} from '@/features/admin/backlog/types';
import { BacklogTodos } from '@/features/admin/backlog/ui/BacklogTodos';
import { RequestDetail } from '@/features/admin/backlog/ui/RequestDetail';
import {
  newUploadItem,
  RequestForm,
  RequestFormView,
} from '@/features/admin/backlog/ui/RequestForm';
import { RequestList } from '@/features/admin/backlog/ui/RequestList';
import { SectionError } from '@/features/admin/backlog/ui/RouteStates';
import type { UploadItem } from '@/features/admin/backlog/ui/WireframeUploader';
import { users } from '@/fixtures';
import type { ActionResult } from '@/types/domain';

// ---------- Generated placeholder images (no real screenshots) ----------

/** A tiny SVG "wireframe" as a data URL: a header bar, a box and a few lines. */
export function placeholderWireframe(n: number): string {
  const hue = (n * 70) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
<rect width="320" height="240" fill="hsl(${hue} 30% 96%)"/>
<rect x="16" y="16" width="288" height="28" rx="4" fill="hsl(${hue} 25% 80%)"/>
<rect x="16" y="60" width="120" height="120" rx="4" fill="none" stroke="hsl(${hue} 25% 60%)" stroke-width="2"/>
<line x1="16" y1="60" x2="136" y2="180" stroke="hsl(${hue} 25% 70%)"/>
<line x1="136" y1="60" x2="16" y2="180" stroke="hsl(${hue} 25% 70%)"/>
<rect x="152" y="64" width="152" height="10" rx="2" fill="hsl(${hue} 20% 75%)"/>
<rect x="152" y="86" width="120" height="10" rx="2" fill="hsl(${hue} 20% 75%)"/>
<rect x="152" y="108" width="140" height="10" rx="2" fill="hsl(${hue} 20% 75%)"/>
<text x="160" y="220" font-family="sans-serif" font-size="14" text-anchor="middle" fill="hsl(${hue} 25% 40%)">Wireframe ${n}</text>
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

const admin = users.find((u) => u.role === 'admin') ?? users[0]!;
const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}T15:00:00.000Z`;
const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TODO_ROWS: [title: string, notes: string | null, doneAt: string | null][] = [
  ['Review the theme vocabulary draft', null, null],
  ['Ask branches for missing chord charts', 'Portland and Servant first.', null],
  ['Check last month’s usage report', null, day(28)],
  ['Invite the new music leaders', null, day(30)],
];

export const galleryTodos: AdminTodo[] = TODO_ROWS.map(([title, notes, doneAt], i) => ({
  id: uuid('6', i + 1),
  title,
  notes,
  doneAt,
  doneBy: doneAt ? admin.id : null,
  createdBy: admin.id,
  createdAt: day(10 + i),
  updatedAt: day(10 + i),
}));

const images = (requestId: string, count: number): FeatureRequestImage[] =>
  Array.from({ length: count }, (_, i) => ({
    id: uuid('7', i + 1),
    requestId,
    fileName: `wireframe-${i + 1}.png`,
    mimeType: 'image/png',
    sizeBytes: 2048,
    createdAt: day(20),
    url: placeholderWireframe(i + 1),
  }));

const detailId = uuid('8', 1);
export const galleryDetail: FeatureRequestDetail = {
  id: detailId,
  kind: 'enhancement',
  title: 'Show the capo position next to the key',
  description:
    'When a leader transposes, show where to put the capo.\n\nExample: key of E with a capo on 2 plays D shapes.\nSee the three wireframes below.',
  status: 'planned',
  createdBy: admin.id,
  createdByName: admin.name,
  createdAt: day(20),
  updatedAt: day(22),
  imageCount: 3,
  images: images(detailId, 3),
};

export const galleryRequests: FeatureRequest[] = [
  { ...galleryDetail, imageCount: 3 },
  ...(
    [
      ['change', 'Rename “Energy” to “Feel” on song pages', 'new', 0],
      ['enhancement', 'Print a setlist on one page', 'in_progress', 1],
      ['enhancement', 'Dark mode for the projector view', 'done', 2],
      ['change', 'Hide the year on song rows', 'declined', 0],
      ['enhancement', 'Filter the library by composer', 'new', 0],
    ] as const
  ).map(([kind, title, status, imageCount], i) => ({
    id: uuid('8', i + 2),
    kind,
    title,
    description: '',
    status,
    createdBy: admin.id,
    createdByName: admin.name,
    createdAt: day(21 + i),
    updatedAt: day(21 + i),
    imageCount,
  })),
];

// ---------- Stubbed actions ----------

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const failure = (message: string) =>
  ({ ok: false, error: { code: 'INTERNAL', message } }) as const satisfies ActionResult<never>;

function fakeTodoActions(fail: boolean): TodoActions {
  let n = 100;
  return {
    async addTodo(input) {
      await delay();
      if (fail) return failure('The server is unavailable (gallery stub).');
      const now = new Date().toISOString();
      return {
        ok: true,
        data: {
          id: uuid('6', n++),
          title: input.title.trim(),
          notes: input.notes ?? null,
          doneAt: null,
          doneBy: null,
          createdBy: admin.id,
          createdAt: now,
          updatedAt: now,
        },
      };
    },
    async updateTodo(id, patch) {
      await delay();
      if (fail) return failure('The server is unavailable (gallery stub).');
      const base = galleryTodos.find((t) => t.id === id) ?? galleryTodos[0]!;
      return {
        ok: true,
        data: {
          ...base,
          id,
          doneAt: patch.done ? new Date().toISOString() : null,
          doneBy: patch.done ? admin.id : null,
        },
      };
    },
    async deleteTodo() {
      await delay();
      return fail
        ? failure('The server is unavailable (gallery stub).')
        : { ok: true, data: undefined };
    },
  };
}

/**
 * Request actions over nothing: uploads tick progress for ~1.5 s; a file whose name contains
 * "fail" fails its first finalize (so Retry succeeds); a title of "taken" is refused with a
 * field error.
 */
export function fakeRequestActions(): RequestActions {
  const failedOnce = new Set<string>();
  return {
    async createRequest(input) {
      await delay();
      if (input.title.trim().toLowerCase() === 'taken') {
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: 'Invalid input.',
            fieldErrors: { title: ['A request with this title already exists (gallery stub)'] },
          },
        };
      }
      return {
        ok: true,
        data: {
          ...galleryRequests[1]!,
          ...input,
          description: input.description ?? '',
          status: 'new',
        },
      };
    },
    async updateRequest(id, patch) {
      await delay();
      return { ok: true, data: { ...galleryDetail, ...patch, id } };
    },
    async deleteRequest() {
      await delay();
      return { ok: true, data: undefined };
    },
    async createRequestImageUpload(_requestId, input) {
      await delay(100);
      return { ok: true, data: { imageId: `pending:${input.fileName}`, uploadUrl: 'about:blank' } };
    },
    async finalizeRequestImage(pendingId) {
      await delay();
      const name = pendingId.replace('pending:', '');
      if (name.includes('fail') && !failedOnce.has(name)) {
        failedOnce.add(name);
        return failure('The upload check failed (gallery stub). Retry to succeed.');
      }
      return { ok: true, data: { ...images(detailId, 1)[0]!, fileName: name } };
    },
    async deleteRequestImage() {
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

type TodoView = 'filled' | 'empty' | 'error' | 'failing';

const noop = () => {};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function StaticForm({
  items,
  notice,
  fieldErrors = {},
  rejections = [],
  value = { kind: 'enhancement', title: 'Print a setlist on one page', description: '' },
  saving = false,
}: {
  items: UploadItem[];
  notice?: ReactNode;
  fieldErrors?: Record<string, string[]>;
  rejections?: string[];
  value?: { kind: 'enhancement' | 'change'; title: string; description: string };
  saving?: boolean;
}) {
  return (
    <RequestFormView
      mode="new"
      value={value}
      onChange={noop}
      fieldErrors={fieldErrors}
      formError={null}
      saving={saving}
      existing={[]}
      items={items}
      rejections={rejections}
      notice={notice}
      cancelHref="/dev/admin-backlog"
      onSubmit={(e) => e.preventDefault()}
      onAddFiles={noop}
      onRemoveItem={noop}
      onRetryItem={noop}
      onRemoveExisting={noop}
    />
  );
}

/**
 * Body of `/dev/admin-backlog` (ADM-06): BacklogTodos, RequestList, RequestForm and
 * RequestDetail with fixtures, stubbed actions and generated placeholder wireframes.
 */
export function AdminBacklogGallery() {
  const [todoView, setTodoView] = useState<TodoView>('filled');
  const [listEmpty, setListEmpty] = useState(false);
  const todoActions = useMemo(() => fakeTodoActions(todoView === 'failing'), [todoView]);
  const requestActions = useMemo(() => fakeRequestActions(), []);

  // Upload items hold Files and object URLs, so build them in the browser only.
  const [items, setItems] = useState<{ uploading: UploadItem[]; failed: UploadItem[] } | null>(
    null,
  );
  useEffect(() => {
    setItems({
      uploading: [
        newUploadItem(placeholderPng('home.png'), {
          stage: 'done',
          progress: 1,
          previewUrl: placeholderWireframe(1),
        }),
        newUploadItem(placeholderPng('setlist.png'), {
          stage: 'uploading',
          progress: 0.45,
          previewUrl: placeholderWireframe(2),
        }),
        newUploadItem(placeholderPng('player.png'), { previewUrl: placeholderWireframe(3) }),
      ],
      failed: [
        newUploadItem(placeholderPng('home.png'), {
          stage: 'done',
          progress: 1,
          previewUrl: placeholderWireframe(1),
        }),
        newUploadItem(placeholderPng('menu-fail.png'), {
          stage: 'failed',
          error: 'The upload was interrupted.',
          previewUrl: placeholderWireframe(4),
        }),
      ],
    });
  }, []);

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
      <header className="grid gap-2">
        <h1 className="text-sm font-medium text-muted-foreground">
          ADM-06 · Admin backlog with fixtures and stubbed actions
        </h1>
        <p className="text-sm text-muted-foreground">
          Images are generated placeholders. In the interactive form, a file whose name contains
          “fail” fails once (Retry succeeds), and the title “taken” shows a server field error.
        </p>
      </header>

      <Section title="To-dos">
        <label className="flex flex-col gap-1 text-sm">
          State
          <select
            className="min-h-tap max-w-xs rounded-md border bg-background px-2"
            value={todoView}
            onChange={(e) => setTodoView(e.target.value as TodoView)}
          >
            <option value="filled">Filled</option>
            <option value="empty">Empty</option>
            <option value="error">Load error</option>
            <option value="failing">Actions fail (rollback)</option>
          </select>
        </label>
        {todoView === 'error' ? (
          <SectionError what="the to-dos" />
        ) : (
          <BacklogTodos
            key={todoView}
            todos={todoView === 'empty' ? [] : galleryTodos}
            actions={todoActions}
          />
        )}
      </Section>

      <Section title="Request list">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={listEmpty}
            onChange={(e) => setListEmpty(e.target.checked)}
            className="size-4"
          />
          Empty
        </label>
        <RequestList requests={listEmpty ? [] : galleryRequests} />
        <h3 className="text-sm font-medium">Dashboard preview (5 newest, no filter)</h3>
        <RequestList requests={listEmpty ? [] : galleryRequests} limit={5} />
      </Section>

      <Section title="Request form (interactive)">
        <RequestForm actions={requestActions} />
      </Section>

      <Section title="Request form · uploading">
        {items ? <StaticForm items={items.uploading} saving /> : null}
      </Section>

      <Section title="Request form · a failed image">
        {items ? (
          <StaticForm
            items={items.failed}
            notice={
              <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
                The request was saved, but 1 image didn&apos;t upload: menu-fail.png. Retry or
                remove it below.
              </div>
            }
          />
        ) : null}
      </Section>

      <Section title="Request form · validation errors">
        <StaticForm
          items={[]}
          value={{ kind: 'change', title: '', description: '' }}
          fieldErrors={{ title: ['Enter a title'] }}
          rejections={[
            "“spec.pdf” isn't a PNG, JPEG, WebP or GIF image.",
            '“huge.png” is larger than 10 MB.',
          ]}
        />
      </Section>

      <Section title="Request detail (3 images)">
        <RequestDetail request={galleryDetail} actions={requestActions} />
      </Section>

      <Toaster />
    </div>
  );
}
