'use client';

import { MentorRouteGuard } from '../../components/mentor-route-guard';
import { useMentorAuth } from '../../lib/mentor-auth-context';

export default function MentorProfilePage() {
  const { profile, status } = useMentorAuth();

  return (
    <MentorRouteGuard>
      <section className="card">
        <h1>Mentor Profile</h1>
        {status === 'inactive-profile' && <p className="notice">This mentor profile is currently inactive.</p>}
        {profile && <dl className="profile-details">
          <div><dt>Name</dt><dd>{profile.fullName}</dd></div>
          <div><dt>Headline</dt><dd>{profile.headline ?? 'Not provided'}</dd></div>
          <div><dt>Experience</dt><dd>{profile.experienceYears} years</dd></div>
          <div><dt>Bio</dt><dd>{profile.bio ?? 'Not provided'}</dd></div>
          <div><dt>Subjects</dt><dd>{profile.subjects.length ? profile.subjects.map((subject) => subject.name).join(', ') : 'Not assigned'}</dd></div>
        </dl>}
        <p className="muted">Profile edits are managed by an administrator.</p>
      </section>
    </MentorRouteGuard>
  );
}
