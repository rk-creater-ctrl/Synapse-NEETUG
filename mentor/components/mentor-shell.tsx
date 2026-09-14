'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';

import { useMentorAuth } from '../lib/mentor-auth-context';

export function MentorShell({ children }: { children: ReactNode }) {
  const { logout, profile } = useMentorAuth();
  const router = useRouter();

  async function signOut() {
    await logout();
    router.replace('/login');
  }

  return (
    <>
      <header className="portal-header">
        <div><strong>Synapse</strong><span>Mentor Portal</span></div>
        <nav aria-label="Mentor portal navigation">
          <Link href="/">Dashboard</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/availability">Availability</Link>
          <Link href="/bookings">Bookings</Link>
          {profile && <span className="mentor-name">{profile.fullName}</span>}
          <button type="button" className="secondary-button" onClick={() => void signOut()}>Logout</button>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
