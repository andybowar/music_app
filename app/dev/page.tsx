import { join } from 'node:path';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryAdminOnly, isDevGalleryEnabled } from '@/lib/devGallery';
import { isLocalSupabase, readSupabaseConfig } from './api/supabaseConfig';
import { discoverRoutes, type DevRoute } from './pages';

export const metadata: Metadata = { title: 'Dev · index' };

function RouteList({ routes }: { routes: DevRoute[] | null }) {
  if (routes === null)
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t list pages on this deployment. Open a gallery directly, e.g.{' '}
        <code>/dev/tokens</code>.
      </p>
    );
  if (routes.length === 0) return <p className="text-sm text-muted-foreground">None yet.</p>;
  return (
    <ul className="space-y-1">
      {routes.map((r) => (
        <li key={r.path}>
          <a className="underline underline-offset-4" href={r.path}>
            {r.path}
          </a>
          {r.needsSignIn && <span className="text-sm text-muted-foreground"> (needs sign-in)</span>}
        </li>
      ))}
    </ul>
  );
}

/** Links to every page in the app, plus local dev tools. Dev and preview only. */
export default function DevIndexPage() {
  if (!isDevGalleryEnabled()) notFound();

  // Scans app/ at request time. If the files aren't there (a bundling change), show a note
  // rather than failing the whole page.
  let routes: DevRoute[] | null;
  try {
    routes = discoverRoutes(join(process.cwd(), 'app'));
  } catch {
    routes = null;
  }
  const appPages = routes?.filter((r) => !r.path.startsWith('/dev')) ?? null;
  const galleries = routes?.filter((r) => r.path.startsWith('/dev/')) ?? null;
  const live = isDevGalleryAdminOnly();
  const isLocal = isLocalSupabase(readSupabaseConfig());

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Dev index</h1>
        <p className="text-sm text-muted-foreground">
          Every page in the app, found from the files in <code>app/</code>.
          {live ? null : (
            <>
              {' '}
              Seeded users sign in with the password <code>music-app-dev-password</code>.
            </>
          )}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">App pages</h2>
        <RouteList routes={appPages} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Component galleries</h2>
        <RouteList routes={galleries} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Tools</h2>
        <ul className="space-y-1">
          <li>
            <a className="underline underline-offset-4" href="/dev/api">
              API explorer
            </a>{' '}
            <span className="text-sm text-muted-foreground">
              (Swagger UI for the Supabase REST API)
            </span>
          </li>
          {isLocal && (
            <>
              <li>
                <a className="underline underline-offset-4" href="http://127.0.0.1:54323">
                  Supabase Studio
                </a>{' '}
                <span className="text-sm text-muted-foreground">
                  (tables, SQL editor, auth users)
                </span>
              </li>
              <li>
                <a className="underline underline-offset-4" href="http://127.0.0.1:54324">
                  Mailpit
                </a>{' '}
                <span className="text-sm text-muted-foreground">
                  (emails the app sends, e.g. password resets)
                </span>
              </li>
            </>
          )}
        </ul>
      </section>
    </main>
  );
}
