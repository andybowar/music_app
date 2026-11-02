import { SongPageSkeleton } from '@/features/songs/ui/SongPage';

/**
 * Song page skeleton while the route streams (LIB-18; CR LIB-18-song-page-paths).
 *
 * This boundary also wraps the nested `/songs/[id]/edit` segment, which has its own
 * `loading.tsx` (LIB-17). Its `SongFormSkeleton` is the closer boundary once the edit segment
 * starts rendering, so this one only covers the moment before that.
 */
export default function Loading() {
  return <SongPageSkeleton />;
}
