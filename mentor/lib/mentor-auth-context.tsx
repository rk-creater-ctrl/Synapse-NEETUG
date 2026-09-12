'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { getMentorProfile, loginMentor, logoutMentor, MentorApiError } from './mentor-api';
import { clearMentorSession, getMentorSession, setMentorSession } from './mentor-session';
import { MentorProfile, MentorTokens } from './mentor-types';

export type MentorAuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'authenticated'
  | 'inactive-profile'
  | 'missing-profile'
  | 'error';

type MentorAuthContextValue = {
  status: MentorAuthStatus;
  profile: MentorProfile | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const MentorAuthContext = createContext<MentorAuthContextValue | null>(null);

export function MentorAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MentorAuthStatus>('loading');
  const [profile, setProfile] = useState<MentorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveProfile = useCallback(async (tokens: MentorTokens) => {
    try {
      const nextProfile = await getMentorProfile(tokens.accessToken);
      setProfile(nextProfile);
      setError(null);
      setStatus(nextProfile.isActive ? 'authenticated' : 'inactive-profile');
    } catch (caught) {
      const apiError = caught instanceof MentorApiError ? caught : null;
      if (apiError?.status === 404) {
        setProfile(null);
        setError(null);
        setStatus('missing-profile');
        return;
      }
      if (apiError?.status === 401 || apiError?.status === 403) {
        clearMentorSession();
        setProfile(null);
        setError(null);
        setStatus('unauthenticated');
        throw caught;
      }
      setProfile(null);
      setError(caught instanceof Error ? caught.message : 'Unable to restore the mentor session.');
      setStatus('error');
      throw caught;
    }
  }, []);

  const refresh = useCallback(async () => {
    const tokens = getMentorSession();
    if (!tokens) {
      setProfile(null);
      setError(null);
      setStatus('unauthenticated');
      return;
    }
    setStatus('loading');
    await resolveProfile(tokens);
  }, [resolveProfile]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setStatus('loading');
    setError(null);
    try {
      const tokens = await loginMentor(email, password);
      setMentorSession(tokens);
      await resolveProfile(tokens);
    } catch (error) {
      if (!getMentorSession()) {
        setProfile(null);
        setStatus('unauthenticated');
      }
      throw error;
    }
  }, [resolveProfile]);

  const logout = useCallback(async () => {
    const tokens = getMentorSession();
    try {
      if (tokens) await logoutMentor(tokens);
    } catch {
      // Clearing the local session remains safe even if server logout cannot be reached.
    } finally {
      clearMentorSession();
      setProfile(null);
      setError(null);
      setStatus('unauthenticated');
    }
  }, []);

  return (
    <MentorAuthContext.Provider value={{ status, profile, error, login, logout, refresh }}>
      {children}
    </MentorAuthContext.Provider>
  );
}

export function useMentorAuth(): MentorAuthContextValue {
  const context = useContext(MentorAuthContext);
  if (!context) throw new Error('useMentorAuth must be used inside MentorAuthProvider');
  return context;
}
