export type StoredTokens = {
  accessToken?: string;
  refreshToken?: string;
};

const storageKey = 'synapse_tokens';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const tokens = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as StoredTokens;
    return tokens.accessToken ?? null;
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKey);
}

export function redirectToLogin(): void {
  clearAdminSession();
  if (typeof window !== 'undefined') window.location.assign('/login');
}
