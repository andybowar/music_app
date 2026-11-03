import type { ISODateTime } from '@/types/domain';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** A stored UTC timestamp as a date in the user's locale. */
export function formatDate(iso: ISODateTime): string {
  return dateFormat.format(new Date(iso));
}

/** "1 image", "3 images". */
export function imageCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'image' : 'images'}`;
}
