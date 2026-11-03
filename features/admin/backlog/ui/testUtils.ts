import type { AdminTodo, FeatureRequestDetail, FeatureRequestImage } from '../types';

/** Radix needs these in jsdom. */
export function polyfillDom() {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
}

export const T0 = '2026-11-01T12:00:00.000Z';

export function makeTodo(n: number, overrides: Partial<AdminTodo> = {}): AdminTodo {
  return {
    id: `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    title: `To-do ${n}`,
    notes: null,
    doneAt: null,
    doneBy: null,
    createdBy: 'u',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeImage(n: number): FeatureRequestImage {
  return {
    id: `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    requestId: '50000000-0000-4000-8000-000000000001',
    fileName: `screen-${n}.png`,
    mimeType: 'image/png',
    sizeBytes: 100,
    createdAt: T0,
    url: `https://storage.test/screen-${n}.png`,
  };
}

export function makeRequest(overrides: Partial<FeatureRequestDetail> = {}): FeatureRequestDetail {
  const images = overrides.images ?? [];
  return {
    id: '50000000-0000-4000-8000-000000000001',
    kind: 'enhancement',
    title: 'Show capo position',
    description: 'First line\nSecond line',
    status: 'new',
    createdBy: 'u',
    createdByName: 'Ada Admin',
    createdAt: T0,
    updatedAt: T0,
    imageCount: images.length,
    images,
    ...overrides,
  };
}

export function pngFile(name = 'wire.png', size = 100): File {
  const f = new File([new Uint8Array(size)], name, { type: 'image/png' });
  return f;
}
