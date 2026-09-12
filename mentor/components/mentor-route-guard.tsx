'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';

import { useMentorAuth } from '../lib/mentor-auth-context';
import { MentorShell } from './mentor-shell';

export function MentorRouteGuard({ children }: { children: ReactNode }) {
  const { status, error, refresh, logout } = useMentorAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [router, status]);

  if (status === 'loading' || status === 'unauthenticated') {
    return <main><p className="muted">Restoring mentor session…</p></main>;
  }

  if (status === 'error') {
    return (
      <main><section className="card"><h1>Unable to load the mentor portal</h1><p>{error}</p>
        <div className="actions"><button type="button" onClick={() => void refresh()}>Retry</button>
        <button type="button" className="secondary-button" onClick={() => void logout()}>Logout</button></div>
      </section></main>
    );
  }

  if (status === 'missing-profile') {
    return (
      <MentorShell><section className="card"><h1>Mentor profile unavailable</h1>
        <p>Your account is a mentor account, but a mentor profile has not been configured yet.</p>
        <p className="muted">Please contact an administrator to complete profile setup.</p>
      </section></MentorShell>
    );
  }

  return <MentorShell>{children}</MentorShell>;
}
