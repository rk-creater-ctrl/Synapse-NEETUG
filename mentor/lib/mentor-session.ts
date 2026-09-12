import { MentorTokens } from './mentor-types';

const storageKey = 'synapse_mentor_tokens';
const installationIdStorageKey = 'synapse_mentor_installation_id';

function isValidInstallationId(value: string | null): value is string {
  return value !== null &&
    value.length <= 255 &&
    value.trim().length >= 16 &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

function generateInstallationId(): string {
  if (typeof window === 'undefined' || !window.crypto) {
    throw new Error('A secure browser crypto API is required to sign in.');
  }
  if (typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  if (typeof window.crypto.getRandomValues !== 'function') {
    throw new Error('A secure browser crypto API is required to sign in.');
  }

  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function getMentorInstallationId(): string {
  if (typeof window === 'undefined') {
    throw new Error('Installation identity is only available in a browser.');
  }

  const existing = window.localStorage.getItem(installationIdStorageKey);
  if (isValidInstallationId(existing)) return existing;

  const installationId = generateInstallationId();
  window.localStorage.setItem(installationIdStorageKey, installationId);
  return installationId;
}

export function getMentorSession(): MentorTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<MentorTokens>;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

export function setMentorSession(tokens: MentorTokens): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey, JSON.stringify(tokens));
}

export function clearMentorSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKey);
}
