import type { Metadata } from 'next';

import { ResetRequestForm } from '@/features/auth/ui/ResetForms';

import { AuthShell } from '../login/AuthShell';

export const metadata: Metadata = { title: 'Reset password' };

export default function ResetPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new password."
    >
      <ResetRequestForm />
    </AuthShell>
  );
}
