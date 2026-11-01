'use client';

// Root error boundary (OPS-02; CR OPS-02-instrumentation-client). Catches React render
// errors that escape every nested error.tsx, including errors in the root layout, and
// reports them to Sentry (no-op without a DSN). It replaces the root layout, so it
// renders its own <html> and <body>.
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
          padding: '1rem',
        }}
      >
        <main role="alert" style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem' }}>Something went wrong</h1>
          <p>The error has been reported. You can try again.</p>
          <button type="button" onClick={reset} style={{ padding: '0.5rem 1rem' }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
