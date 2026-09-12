'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { MentorApiError } from '../../lib/mentor-api';
import { useMentorAuth } from '../../lib/mentor-auth-context';

export default function MentorLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { login, status } = useMentorAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated' || status === 'inactive-profile' || status === 'missing-profile') {
      router.replace('/');
    }
  }, [router, status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/');
    } catch (caught) {
      const apiError = caught instanceof MentorApiError ? caught : null;
      setError(apiError?.status === 403
        ? 'This account does not have mentor access.'
        : caught instanceof Error ? caught.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return <main><section className="card login-card"><h1>Mentor login</h1>
    <form className="form-stack" onSubmit={submit}>
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
      <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
      <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </section></main>;
}
