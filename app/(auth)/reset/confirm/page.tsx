import type { Metadata } from 'next';

import Link from 'next/link';

import { ResetConfirmForm } from '@/features/auth/ui/ResetForms';

import { AuthShell } from '../../login/AuthShell';

export const metadata: Metadata = { title: 'Choose a new password' };

/**
 * Landing page for the reset email. Supabase verifies the link and redirects
 * here with `?code=` (PKCE), or with `?error=…` when the link is expired/used.
 */
export default async function ResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code, error } = await searchParams;
  const token = typeof code === 'string' ? code : undefined;

  if (!token || error) {
    return (
      <AuthShell title="Reset link expired">
        <div className="space-y-4">
          <p role="alert" className="text-sm">
            This reset link is invalid or has expired. Reset links work once, in the browser you
            requested them from.
          </p>
          <p className="text-center text-sm">
            <Link
              href="/reset"
              className="inline-flex min-h-10 items-center text-primary underline underline-offset-4 hover:decoration-2"
            >
              Request a new reset link
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <ResetConfirmForm token={token} />
    </AuthShell>
  );
}
