'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { MentorRouteGuard } from '../../components/mentor-route-guard';
import { getMentorAvailability, MentorApiError, replaceMentorAvailability } from '../../lib/mentor-api';
import { useMentorAuth } from '../../lib/mentor-auth-context';
import { getMentorSession } from '../../lib/mentor-session';
import { MentorAvailability, ReplaceMentorAvailabilityInput } from '../../lib/mentor-types';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type EditableSlot = { key: string; dayOfWeek: number; start: string; end: string };

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function toEditableSlots(availability: MentorAvailability): EditableSlot[] {
  return availability.slots.map((slot) => ({
    key: slot.id,
    dayOfWeek: slot.dayOfWeek,
    start: formatMinute(slot.startMinute),
    end: formatMinute(slot.endMinute),
  }));
}

function validateAvailability(timezone: string, slots: EditableSlot[]): ReplaceMentorAvailabilityInput {
  const trimmedTimezone = timezone.trim();
  if (!trimmedTimezone) throw new Error('Timezone is required.');
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmedTimezone }).format();
  } catch {
    throw new Error('Enter a valid IANA timezone, such as Asia/Kolkata or UTC.');
  }

  const normalized = slots.map((slot) => {
    const startMinute = parseTime(slot.start);
    const endMinute = parseTime(slot.end);
    if (startMinute === null || endMinute === null) {
      throw new Error('Availability times must use valid HH:MM values.');
    }
    if (startMinute >= endMinute) {
      throw new Error('Each availability window must end after it starts.');
    }
    return { dayOfWeek: slot.dayOfWeek, startMinute, endMinute };
  }).sort((left, right) =>
    left.dayOfWeek - right.dayOfWeek || left.startMinute - right.startMinute || left.endMinute - right.endMinute,
  );

  const exact = new Set<string>();
  for (let index = 0; index < normalized.length; index += 1) {
    const slot = normalized[index];
    const key = `${slot.dayOfWeek}:${slot.startMinute}:${slot.endMinute}`;
    if (exact.has(key)) throw new Error('Duplicate availability windows are not allowed.');
    exact.add(key);
    const previous = normalized[index - 1];
    if (previous && previous.dayOfWeek === slot.dayOfWeek && previous.endMinute > slot.startMinute) {
      throw new Error('Availability windows on the same day cannot overlap.');
    }
  }
  return { timezone: trimmedTimezone, slots: normalized };
}

export default function MentorAvailabilityPage() {
  const { status } = useMentorAuth();
  const [timezone, setTimezone] = useState('UTC');
  const [slots, setSlots] = useState<EditableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const draftId = useRef(0);

  const loadAvailability = useCallback(async () => {
    const session = getMentorSession();
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const availability = await getMentorAvailability(session.accessToken);
      setTimezone(availability.timezone);
      setSlots(toEditableSlots(availability));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load availability.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated' || status === 'inactive-profile') void loadAvailability();
  }, [loadAvailability, status]);

  function updateSlot(key: string, field: 'start' | 'end', value: string) {
    setSlots((current) => current.map((slot) => slot.key === key ? { ...slot, [field]: value } : slot));
    setSuccess(null);
  }

  function addSlot(dayOfWeek: number) {
    draftId.current += 1;
    setSlots((current) => [...current, { key: `draft-${draftId.current}`, dayOfWeek, start: '09:00', end: '10:00' }]);
    setSuccess(null);
  }

  async function save() {
    const session = getMentorSession();
    if (!session) return;
    setError(null);
    setSuccess(null);
    let input: ReplaceMentorAvailabilityInput;
    try {
      input = validateAvailability(timezone, slots);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Availability is invalid.');
      return;
    }
    setSaving(true);
    try {
      const availability = await replaceMentorAvailability(session.accessToken, input);
      setTimezone(availability.timezone);
      setSlots(toEditableSlots(availability));
      setSuccess('Availability saved.');
    } catch (caught) {
      const apiError = caught instanceof MentorApiError ? caught : null;
      setError(apiError?.message ?? (caught instanceof Error ? caught.message : 'Unable to save availability.'));
    } finally {
      setSaving(false);
    }
  }

  return <MentorRouteGuard><section className="card">
    <h1>Availability</h1>
    {status === 'inactive-profile' && <p className="notice">Your mentor profile is inactive. You can still manage your recurring availability.</p>}
    <p className="muted">Set normal weekly availability. Times are interpreted in your selected IANA timezone.</p>
    <label className="form-stack">Timezone<input value={timezone} onChange={(event) => { setTimezone(event.target.value); setSuccess(null); }} placeholder="Asia/Kolkata" disabled={loading || saving} /></label>
    {loading ? <p className="muted">Loading availability…</p> : <div className="availability-days">
      {days.map((day, dayOfWeek) => {
        const daySlots = slots.filter((slot) => slot.dayOfWeek === dayOfWeek);
        return <section className="availability-day" key={day}>
          <div className="availability-day-header"><h2>{day}</h2><button type="button" className="secondary-button" disabled={saving} onClick={() => addSlot(dayOfWeek)}>Add window</button></div>
          {daySlots.length === 0 ? <p className="muted">No windows.</p> : daySlots.map((slot) => <div className="availability-slot" key={slot.key}>
            <label>Start<input type="time" value={slot.start} disabled={saving} onChange={(event) => updateSlot(slot.key, 'start', event.target.value)} /></label>
            <label>End<input type="time" value={slot.end} disabled={saving} onChange={(event) => updateSlot(slot.key, 'end', event.target.value)} /></label>
            <button type="button" className="secondary-button" disabled={saving} onClick={() => { setSlots((current) => current.filter((item) => item.key !== slot.key)); setSuccess(null); }}>Remove</button>
          </div>)}
        </section>;
      })}
    </div>}
    <div className="actions">
      <button type="button" disabled={loading || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save availability'}</button>
      <button type="button" className="secondary-button" disabled={loading || saving || slots.length === 0} onClick={() => { setSlots([]); setSuccess(null); }}>Clear all windows</button>
      <button type="button" className="secondary-button" disabled={loading || saving} onClick={() => void loadAvailability()}>Reload</button>
    </div>
    {success && <p role="status">{success}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section></MentorRouteGuard>;
}
