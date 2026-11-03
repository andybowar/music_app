/**
 * Wireframe uploader file checks (ADM-06). Pure, so they run before anything is uploaded and
 * are unit-tested on their own. The server repeats every check.
 */
import { isImageMimeType, MAX_IMAGE_BYTES, MAX_IMAGES_PER_REQUEST } from '../types';

export interface FileCheck {
  accepted: File[];
  /** One plain-language message per refused file. */
  rejected: string[];
}

/**
 * Split `files` into the ones that may be added and messages for the rest. `used` is how many
 * images the request already has or has queued; at most `MAX_IMAGES_PER_REQUEST` in total.
 */
export function checkImageFiles(files: readonly File[], used: number): FileCheck {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    const name = file.name || 'Pasted image';
    if (!isImageMimeType(file.type)) {
      rejected.push(`“${name}” isn't a PNG, JPEG, WebP or GIF image.`);
    } else if (file.size === 0) {
      rejected.push(`“${name}” is empty.`);
    } else if (file.size > MAX_IMAGE_BYTES) {
      rejected.push(`“${name}” is larger than 10 MB.`);
    } else if (used + accepted.length >= MAX_IMAGES_PER_REQUEST) {
      rejected.push(
        `“${name}” wasn't added: a request can have at most ${MAX_IMAGES_PER_REQUEST} images.`,
      );
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

/** Image files from a paste or drop, given clipboard/drag data. Text items are ignored. */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (files.length > 0) return files;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

/** "2.4 MB", "830 KB", "512 B". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
