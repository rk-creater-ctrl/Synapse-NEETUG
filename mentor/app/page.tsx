'use client';

import Link from 'next/link';

import { MentorRouteGuard } from '../components/mentor-route-guard';
import { useMentorAuth } from '../lib/mentor-auth-context';

export default function MentorDashboardPage() {
  const { profile, status } = useMentorAuth();

  return (
    <MentorRouteGuard>
      <section className="card">
        <h1>Mentor Dashboard</h1>
        {status === 'inactive-profile' && (
          <p className="notice">Your mentor profile is inactive. Availability and booking features are not available.</p>
        )}
        {profile && <>
          <p>Welcome, {profile.fullName}.</p>
          <p className="muted">This portal currently provides read-only mentor profile information.</p>
          <h2>Subject expertise</h2>
          {profile.subjects.length === 0
            ? <p className="muted">No subjects are assigned to this mentor profile.</p>
            : <ul>{profile.subjects.map((subject) => <li key={subject.id}>{subject.name}</li>)}</ul>}
          <Link className="link-button" href="/profile">View profile</Link>
        </>}
      </section>
    </MentorRouteGuard>
  );
}
