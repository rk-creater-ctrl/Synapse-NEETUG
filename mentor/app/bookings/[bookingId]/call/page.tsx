'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { MentorRouteGuard } from '../../../../components/mentor-route-guard';
import { getMentorVideoAccess } from '../../../../lib/mentor-api';
import { useMentorAuth } from '../../../../lib/mentor-auth-context';
import { getMentorSession } from '../../../../lib/mentor-session';
import { MentorVideoAccess } from '../../../../lib/mentor-types';
import { mentorVideoErrorMessage } from '../../../../lib/mentor-video';

export default function MentorBookingCallPage() {
  const { status } = useMentorAuth();
  const params = useParams<{ bookingId: string }>();
  const [access, setAccess] = useState<MentorVideoAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (status !== 'authenticated' || !params.bookingId) return;
    let disposed = false;
    async function load() {
      const session = getMentorSession();
      if (!session) return;
      setLoading(true);
      setError(null);
      try {
        const next = await getMentorVideoAccess(session.accessToken, params.bookingId);
        if (!disposed) setAccess(next);
      } catch (caught) {
        if (!disposed) setError(mentorVideoErrorMessage(caught));
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void load();
    return () => { disposed = true; };
  }, [attempt, params.bookingId, status]);

  return <MentorRouteGuard><section className="card">
    <h1>Mentor Call</h1>
    {loading && <p className="muted">Requesting secure call access…</p>}
    {error && <><p className="error" role="alert">{error}</p><button type="button" onClick={() => setAttempt((current) => current + 1)}>Retry</button></>}
    {access && <>
      <p>Your confirmed session is authorized until {new Date(access.accessExpiresAt).toLocaleTimeString()}.</p>
      <p className="muted">Secure peer-to-peer call controls will be available in the next WebRTC client phase.</p>
    </>}
  </section></MentorRouteGuard>;
}
