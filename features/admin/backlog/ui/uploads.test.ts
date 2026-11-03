import { describe, expect, it } from 'vitest';

import { MAX_IMAGE_BYTES } from '../types';
import { checkImageFiles, formatBytes, imageFilesFrom } from './uploads';

function file(name: string, type: string, size = 10): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('checkImageFiles', () => {
  it('accepts PNG, JPEG, WebP and GIF', () => {
    const files = [
      file('a.png', 'image/png'),
      file('b.jpg', 'image/jpeg'),
      file('c.webp', 'image/webp'),
      file('d.gif', 'image/gif'),
    ];
    expect(checkImageFiles(files, 0)).toEqual({ accepted: files, rejected: [] });
  });

  it('rejects other types with a clear message', () => {
    const result = checkImageFiles([file('spec.pdf', 'application/pdf')], 0);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual(["“spec.pdf” isn't a PNG, JPEG, WebP or GIF image."]);
  });

  it('rejects empty files and files over 10 MB', () => {
    const result = checkImageFiles(
      [
        file('empty.png', 'image/png', 0),
        file('big.png', 'image/png', MAX_IMAGE_BYTES + 1),
        file('max.png', 'image/png', MAX_IMAGE_BYTES),
      ],
      0,
    );
    expect(result.accepted.map((f) => f.name)).toEqual(['max.png']);
    expect(result.rejected).toEqual(['“empty.png” is empty.', '“big.png” is larger than 10 MB.']);
  });

  it('keeps the total at 5, counting images already there', () => {
    const files = ['1', '2', '3'].map((n) => file(`${n}.png`, 'image/png'));
    const result = checkImageFiles(files, 3);
    expect(result.accepted.map((f) => f.name)).toEqual(['1.png', '2.png']);
    expect(result.rejected).toEqual(["“3.png” wasn't added: a request can have at most 5 images."]);
    expect(checkImageFiles(files, 5).accepted).toEqual([]);
  });

  it('names unnamed (pasted) files', () => {
    expect(checkImageFiles([file('', 'text/plain')], 0).rejected[0]).toContain('Pasted image');
  });
});

describe('imageFilesFrom', () => {
  it('prefers files, falls back to file items, ignores text', () => {
    const png = file('a.png', 'image/png');
    expect(imageFilesFrom(null)).toEqual([]);
    expect(imageFilesFrom({ files: [png], items: [] } as unknown as DataTransfer)).toEqual([png]);
    const items = [
      { kind: 'string', getAsFile: () => null },
      { kind: 'file', getAsFile: () => png },
    ];
    expect(imageFilesFrom({ files: [], items } as unknown as DataTransfer)).toEqual([png]);
  });
});

describe('formatBytes', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
