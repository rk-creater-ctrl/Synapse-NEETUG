import { MentorProfile, MentorTokens } from './mentor-types';
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

export async function logoutMentor(tokens: MentorTokens): Promise<void> {
  await request<void>('auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  }, tokens.accessToken);
}
