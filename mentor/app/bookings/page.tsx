'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { MentorRouteGuard } from '../../components/mentor-route-guard';
import {
  cancelMentorBooking,
  completeMentorBooking,
  confirmMentorBooking,
  getMentorBookings,
} from '../../lib/mentor-api';
import { useMentorAuth } from '../../lib/mentor-auth-context';
import { getMentorSession } from '../../lib/mentor-session';
import { MentorBooking } from '../../lib/mentor-types';
import { canJoinMentorBooking } from '../../lib/mentor-video';

export default function MentorBookingsPage() {
  const { status } = useMentorAuth();
  const [bookings, setBookings] = useState<MentorBooking[]>([]);
  const [scope, setScope] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const session = getMentorSession();
    if (!session) return;
    setLoading(true); setError(null);
    try { setBookings(await getMentorBookings(session.accessToken, scope)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load mentor bookings.'); }
    finally { setLoading(false); }
  }, [scope]);

  useEffect(() => { if (status === 'authenticated') void load(); }, [load, status]);

  async function act(booking: MentorBooking, action: 'confirm' | 'cancel' | 'complete') {
    const session = getMentorSession();
    if (!session) return;
    setActingId(booking.id); setError(null);
    try {
      const next = action === 'confirm'
        ? await confirmMentorBooking(session.accessToken, booking.id)
        : action === 'cancel'
          ? await cancelMentorBooking(session.accessToken, booking.id)
          : await completeMentorBooking(session.accessToken, booking.id);
      setBookings((current) => current.map((item) => item.id === next.id ? { ...item, ...next, student: item.student } : item));
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Booking action failed.'); }
    finally { setActingId(null); }
  }

  return <MentorRouteGuard><section className="card">
    <h1>Bookings</h1>
    <p className="muted">Manage your upcoming and historical 15-minute sessions.</p>
    <div className="actions">
      {(['upcoming', 'past', 'all'] as const).map((nextScope) => <button key={nextScope} type="button" className={scope === nextScope ? '' : 'secondary-button'} disabled={loading || actingId !== null} onClick={() => setScope(nextScope)}>{nextScope[0].toUpperCase() + nextScope.slice(1)}</button>)}
    </div>
    {loading ? <p className="muted">Loading bookings…</p> : bookings.length === 0 ? <p className="muted">No bookings yet.</p> : <div className="availability-days">
      {bookings.map((booking) => <section className="availability-day" key={booking.id}>
        <h2>{booking.student.fullName}</h2>
        <p>{booking.localDate} {booking.localStartTime} - {booking.localEndTime} ({booking.mentorTimezone})</p>
        <p className="muted">Status: {booking.status}</p>
        <div className="actions">
          {booking.status === 'PENDING' && <button type="button" disabled={actingId === booking.id} onClick={() => void act(booking, 'confirm')}>Confirm</button>}
          {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && <button type="button" className="secondary-button" disabled={actingId === booking.id} onClick={() => void act(booking, 'cancel')}>Cancel</button>}
          {booking.status === 'CONFIRMED' && <button type="button" disabled={actingId === booking.id} onClick={() => void act(booking, 'complete')}>Complete</button>}
          {canJoinMentorBooking(booking) && <Link className="link-button" href={`/bookings/${encodeURIComponent(booking.id)}/call`}>Join Call</Link>}
        </div>
      </section>)}
    </div>}
    <div className="actions"><button type="button" className="secondary-button" disabled={loading || actingId !== null} onClick={() => void load()}>Reload</button></div>
    {error && <p className="error" role="alert">{error}</p>}
  </section></MentorRouteGuard>;
}
