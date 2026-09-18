'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { adminGet } from '../../lib/api';

type Community = {
  id: string;
  name: string;
  description: string | null;
  type: 'GROUP' | 'CHANNEL';
  visibility: 'PUBLIC' | 'PRIVATE';
  membershipRole: 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
  createdAt: string;
};

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void adminGet<Community[]>('/communities/me')
      .then(setCommunities)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load communities.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card">
      <h1>Community management</h1>
      <p className="muted">Only communities where your authenticated account has a community membership are shown.</p>
      {error && <p>{error}</p>}
      {loading ? <p className="muted">Loading…</p> : communities.length === 0 ? <p className="muted">No community memberships found.</p> : (
        <table>
          <thead><tr><th>Community</th><th>Type</th><th>Visibility</th><th>Your role</th><th /></tr></thead>
          <tbody>{communities.map((community) => <tr key={community.id}>
            <td><b>{community.name}</b>{community.description && <div className="muted">{community.description}</div>}</td>
            <td>{community.type}</td><td>{community.visibility}</td><td>{community.membershipRole}</td>
            <td><Link href={`/communities/${community.id}`}>Manage</Link></td>
          </tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
