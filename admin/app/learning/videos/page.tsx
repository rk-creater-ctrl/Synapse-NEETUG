'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminMutation, type PaginatedResponse } from '../../../lib/api';
import { ContentFilters } from '../ContentFilters';
import { ContentStatusControls } from '../ContentStatusControls';
import { defaultContentFilters, type ContentFilters as Filters, type VideoItem } from '../cms-types';
import { LearningForm } from '../LearningForm';
import { PaginationControls } from '../PaginationControls';

const emptyPage = { items: [] as VideoItem[], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };

export default function VideosPage() {
  const [page, setPage] = useState(emptyPage);
  const [filters, setFilters] = useState<Filters>(defaultContentFilters);
  const [editing, setEditing] = useState<VideoItem | undefined>();
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setPage(await adminGet<PaginatedResponse<VideoItem>>('/admin/learning/videos', filters));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load videos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [filters]);

  const updateStatus = async (item: VideoItem, changes: Record<string, boolean>) => {
    try {
      await adminMutation(`/admin/learning/videos/${item.id}`, 'PATCH', changes);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update video.');
    }
  };

  const closeForm = () => { setCreating(false); setEditing(undefined); };

  return (
    <div>
      <div className="card">
        <h1>Learning videos</h1>
        <button onClick={() => { setEditing(undefined); setCreating(true); }}>Create video</button>
        <ContentFilters kind="videos" value={filters} onChange={setFilters} />
        {error && <p>{error}</p>}
        {loading ? <p className="muted">Loading…</p> : page.items.length === 0 ? <p className="muted">No videos found.</p> : (
          <table>
            <thead><tr><th>Title</th><th>Provider</th><th>Publication</th><th>Activity</th><th>Access</th><th>Actions</th></tr></thead>
            <tbody>{page.items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td><td>{item.provider}</td>
                <td>{item.isPublished ? 'Published' : 'Draft'}</td>
                <td>{item.isActive ? 'Active' : 'Inactive'}</td>
                <td>{item.isFree ? 'Free' : 'Premium'}</td>
                <td><button onClick={() => { setCreating(false); setEditing(item); }}>Edit</button>{' '}<ContentStatusControls item={item} premium="isFree" onChange={(changes) => void updateStatus(item, changes)} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <PaginationControls meta={page.meta} onPageChange={(nextPage) => setFilters((current) => ({ ...current, page: nextPage }))} />
      </div>
      {(creating || editing) && (
        <LearningForm
          key={editing?.id ?? 'create'} kind="videos" editing={editing}
          onSaved={() => { closeForm(); void load(); }} onCancel={closeForm}
        />
      )}
    </div>
  );
}
