'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminMutation, type PaginatedResponse } from '../../../lib/api';
import { ContentFilters } from '../ContentFilters';
import { ContentStatusControls } from '../ContentStatusControls';
import { defaultContentFilters, type ContentFilters as Filters, type FlashcardItem } from '../cms-types';
import { PaginationControls } from '../PaginationControls';
import { FlashcardForm } from './FlashcardForm';

const emptyPage = { items: [] as FlashcardItem[], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };

export default function FlashcardsPage() {
  const [page, setPage] = useState(emptyPage);
  const [filters, setFilters] = useState<Filters>(defaultContentFilters);
  const [editing, setEditing] = useState<FlashcardItem | undefined>();
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setPage(await adminGet<PaginatedResponse<FlashcardItem>>('/admin/learning/flashcards', filters));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load flashcards.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [filters]);

  const updateStatus = async (item: FlashcardItem, changes: Record<string, boolean>) => {
    try {
      await adminMutation(`/admin/learning/flashcards/${item.id}`, 'PATCH', changes);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update flashcard.');
    }
  };

  const closeForm = () => { setCreating(false); setEditing(undefined); };

  return (
    <div>
      <div className="card">
        <h1>Learning flashcards</h1>
        <button onClick={() => { setEditing(undefined); setCreating(true); }}>Create flashcard</button>
        <ContentFilters kind="flashcards" value={filters} onChange={setFilters} />
        {error && <p>{error}</p>}
        {loading ? <p className="muted">Loading…</p> : page.items.length === 0 ? <p className="muted">No flashcards found.</p> : (
          <table>
            <thead><tr><th>Front</th><th>Sort</th><th>Access</th><th>Publication</th><th>Activity</th><th>Actions</th></tr></thead>
            <tbody>{page.items.map((item) => (
              <tr key={item.id}>
                <td>{item.title || item.frontContent}</td><td>{item.sortOrder}</td>
                <td>{item.isPremium ? 'Premium' : 'Free'}</td>
                <td>{item.isPublished ? 'Published' : 'Draft'}</td>
                <td>{item.isActive ? 'Active' : 'Inactive'}</td>
                <td><button onClick={() => { setCreating(false); setEditing(item); }}>Edit</button>{' '}<ContentStatusControls item={item} premium="isPremium" onChange={(changes) => void updateStatus(item, changes)} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <PaginationControls meta={page.meta} onPageChange={(nextPage) => setFilters((current) => ({ ...current, page: nextPage }))} />
      </div>
      {(creating || editing) && (
        <FlashcardForm key={editing?.id ?? 'create'} editing={editing} onSaved={() => { closeForm(); void load(); }} onCancel={closeForm} />
      )}
    </div>
  );
}
