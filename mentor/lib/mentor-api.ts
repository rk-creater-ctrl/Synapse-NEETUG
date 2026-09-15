import {
  MentorAvailability,
  MentorProfile,
  MentorTokens,
  ReplaceMentorAvailabilityInput,
  MentorBooking,
  MentorVideoAccess,
} from './mentor-types';
import { getMentorInstallationId } from './mentor-session';

export class MentorApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function readBody(response: Response): Promise<unknown> {
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return undefined;
  return response.json();
}

async function request<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
  });
  const body = await readBody(response);
  if (!response.ok) {
    const details = body as { message?: string | string[]; code?: string } | undefined;
    const message = Array.isArray(details?.message)
      ? details.message.join(', ')
      : details?.message ?? 'The request could not be completed.';
    throw new MentorApiError(response.status, message, details?.code);
  }
  return body as T;
}

export function loginMentor(email: string, password: string): Promise<MentorTokens> {
  return request<MentorTokens>('auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      installationId: getMentorInstallationId(),
      deviceName: 'Mentor Web',
      platform: 'web',
    }),
  });
}

export function getMentorProfile(accessToken: string): Promise<MentorProfile> {
  return request<MentorProfile>('mentors/me', {}, accessToken);
}

export function getMentorAvailability(accessToken: string): Promise<MentorAvailability> {
  return request<MentorAvailability>('mentors/me/availability', {}, accessToken);
}

export function replaceMentorAvailability(
  accessToken: string,
  input: ReplaceMentorAvailabilityInput,
): Promise<MentorAvailability> {
  return request<MentorAvailability>('mentors/me/availability', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }, accessToken);
}

export function getMentorBookings(accessToken: string, scope: 'upcoming' | 'past' | 'all' = 'upcoming'): Promise<MentorBooking[]> {
  return request<MentorBooking[]>(`mentors/me/bookings?scope=${encodeURIComponent(scope)}`, {}, accessToken);
}

export function confirmMentorBooking(accessToken: string, bookingId: string): Promise<MentorBooking> {
  return request<MentorBooking>(`mentors/me/bookings/${bookingId}/confirm`, { method: 'POST' }, accessToken);
}

export function cancelMentorBooking(accessToken: string, bookingId: string): Promise<MentorBooking> {
  return request<MentorBooking>(`mentors/me/bookings/${bookingId}/cancel`, { method: 'POST' }, accessToken);
}

export function completeMentorBooking(accessToken: string, bookingId: string): Promise<MentorBooking> {
  return request<MentorBooking>(`mentors/me/bookings/${bookingId}/complete`, { method: 'POST' }, accessToken);
}

export function getMentorVideoAccess(accessToken: string, bookingId: string): Promise<MentorVideoAccess> {
  return request<MentorVideoAccess>(`mentors/me/bookings/${bookingId}/video-access`, { method: 'POST' }, accessToken);
}

export async function logoutMentor(tokens: MentorTokens): Promise<void> {
  await request<void>('auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  }, tokens.accessToken);
}
