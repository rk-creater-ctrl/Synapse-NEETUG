'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { adminGet, adminMutation } from '../../../lib/api';

type Community = {
  id: string;
  name: string;
  type: string;
  visibility: string;
  membershipRole?: 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
  viewerMembership?: { userId: string; role: 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER'; mutedUntil: string | null };
};
type Member = { userId: string; displayName: string; role: string; mutedUntil: string | null; bannedAt: string | null };
type Report = {
  id: string; reason: string; details: string | null; status: string; createdAt: string;
  message: { id: string; content: string | null; isDeleted: boolean; author: { displayName: string } };
  reporter: { displayName: string };
};
type Action = { id: string; action: string; reason: string | null; createdAt: string; actor: { displayName: string }; targetUser?: { displayName: string } };
type CursorPage<T> = { items: T[]; nextCursor: string | null };

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
type CommunityRole = NonNullable<Community['membershipRole']>;
const manageableRoles: Record<CommunityRole, CommunityRole[]> = {
  OWNER: ['ADMIN', 'MODERATOR', 'MEMBER'],
  ADMIN: ['MODERATOR', 'MEMBER'],
  MODERATOR: ['MEMBER'],
  MEMBER: [],
};
const canModerateMember = (viewer: Community['viewerMembership'] | undefined, member: Member) =>
  viewer !== undefined
  && viewer.userId !== member.userId
  && manageableRoles[viewer.role].includes(member.role as CommunityRole);

export default function CommunityDetailPage({ params }: { params: Promise<{ communityId: string }> }) {
  const [communityId, setCommunityId] = useState<string>();
  const [community, setCommunity] = useState<Community>();
  const [members, setMembers] = useState<Member[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [memberCursor, setMemberCursor] = useState<string | null>(null);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [actionCursor, setActionCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (id = communityId) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [currentCommunity, memberPage, reportPage, actionPage] = await Promise.all([
        adminGet<Community>(`/communities/${id}`),
        adminGet<CursorPage<Member>>(`/communities/${id}/moderation/members`, { limit: 50 }),
        adminGet<CursorPage<Report>>(`/communities/${id}/moderation/reports`, { limit: 50 }),
        adminGet<CursorPage<Action>>(`/communities/${id}/moderation/actions`, { limit: 50 }),
      ]);
      setCommunity(currentCommunity);
      setMembers(memberPage.items);
      setReports(reportPage.items);
      setActions(actionPage.items);
      setMemberCursor(memberPage.nextCursor);
      setReportCursor(reportPage.nextCursor);
      setActionCursor(actionPage.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load community moderation controls.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void params.then((resolved) => setCommunityId(resolved.communityId)); }, [params]);
  useEffect(() => { void load(); }, [communityId]);

  const mutate = async (path: string, method: 'PUT' | 'DELETE', body: unknown = {}) => {
    try {
      await adminMutation(path, method, body);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The moderation action could not be completed.');
    }
  };
  const mute = (member: Member) => {
    if (!communityId) return;
    const duration = window.prompt('Mute duration in minutes (60, 1440, or 10080):', '60');
    if (duration !== '60' && duration !== '1440' && duration !== '10080') {
      setError('Choose one of the supported mute durations: 60, 1440, or 10080 minutes.');
      return;
    }
    void mutate(`/communities/${communityId}/members/${member.userId}/mute`, 'PUT', { durationMinutes: Number(duration) });
  };
  const loadMore = async <T,>(
    path: string,
    cursor: string | null,
    append: (items: T[]) => void,
    setCursor: (next: string | null) => void,
  ) => {
    if (!cursor) return;
    try {
      const page = await adminGet<CursorPage<T>>(path, { limit: 50, cursor });
      append(page.items);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load more moderation records.');
    }
  };

  return (
    <div>
      <p><Link href="/communities">← Communities</Link></p>
      <div className="card">
        <h1>{community?.name ?? 'Community moderation'}</h1>
        {community && <p className="muted">{community.type} · {community.visibility} · Your role: {community.membershipRole ?? 'Reader'}</p>}
        {error && <p>{error}</p>}
        {loading && <p className="muted">Loading…</p>}
      </div>
      {!loading && communityId && <>
        <section className="card"><h2>Members</h2>
          <table><thead><tr><th>Member</th><th>Role</th><th>Mute</th><th>Ban</th><th>Actions</th></tr></thead><tbody>
            {members.map((member) => <tr key={member.userId}><td>{member.displayName}</td><td>{member.role}</td><td>{dateTime(member.mutedUntil)}</td><td>{member.bannedAt ? 'Banned' : 'Active'}</td><td className="row">
              {canModerateMember(community?.viewerMembership, member) && <>
                {member.bannedAt ? <button onClick={() => void mutate(`/communities/${communityId}/members/${member.userId}/ban`, 'DELETE')}>Unban</button> : <button onClick={() => { if (window.confirm(`Ban ${member.displayName}?`)) void mutate(`/communities/${communityId}/members/${member.userId}/ban`, 'PUT'); }}>Ban</button>}
                {member.mutedUntil ? <button onClick={() => void mutate(`/communities/${communityId}/members/${member.userId}/mute`, 'DELETE')}>Unmute</button> : <button onClick={() => mute(member)}>Mute</button>}
              </>}
            </td></tr>)}
          </tbody></table>
          {memberCursor && <button onClick={() => void loadMore<Member>(`/communities/${communityId}/moderation/members`, memberCursor, (items) => setMembers((current) => [...current, ...items]), setMemberCursor)}>Load more members</button>}
        </section>
        <section className="card"><h2>Open reports</h2>
          {reports.length === 0 ? <p className="muted">No open reports.</p> : <table><thead><tr><th>Report</th><th>Message</th><th>Reporter</th><th>Actions</th></tr></thead><tbody>
            {reports.map((report) => <tr key={report.id}><td>{report.reason}<div className="muted">{report.details ?? 'No details'} · {dateTime(report.createdAt)}</div></td><td>{report.message.isDeleted ? <i>Message deleted</i> : <>{report.message.content}<div className="muted">{report.message.author.displayName}</div></>}</td><td>{report.reporter.displayName}</td><td className="row">
              {!report.message.isDeleted && <button onClick={() => { if (window.confirm('Delete this reported message?')) void mutate(`/communities/${communityId}/messages/${report.message.id}`, 'DELETE'); }}>Delete message</button>}
              <button onClick={() => void mutate(`/communities/${communityId}/moderation/reports/${report.id}/resolve`, 'PUT')}>Resolve</button>
              <button onClick={() => void mutate(`/communities/${communityId}/moderation/reports/${report.id}/dismiss`, 'PUT')}>Dismiss</button>
            </td></tr>)}
          </tbody></table>}
          {reportCursor && <button onClick={() => void loadMore<Report>(`/communities/${communityId}/moderation/reports`, reportCursor, (items) => setReports((current) => [...current, ...items]), setReportCursor)}>Load more reports</button>}
        </section>
        <section className="card"><h2>Moderation history</h2>
          {actions.length === 0 ? <p className="muted">No moderation actions recorded.</p> : <table><thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>Reason</th><th>Time</th></tr></thead><tbody>
            {actions.map((action) => <tr key={action.id}><td>{action.action}</td><td>{action.actor.displayName}</td><td>{action.targetUser?.displayName ?? 'Message'}</td><td>{action.reason ?? '—'}</td><td>{dateTime(action.createdAt)}</td></tr>)}
          </tbody></table>}
          {actionCursor && <button onClick={() => void loadMore<Action>(`/communities/${communityId}/moderation/actions`, actionCursor, (items) => setActions((current) => [...current, ...items]), setActionCursor)}>Load more actions</button>}
        </section>
      </>}
    </div>
  );
}
