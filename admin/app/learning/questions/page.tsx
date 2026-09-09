'use client';

import { useEffect, useState } from 'react';

import { adminGet, adminMutation, type PaginatedResponse } from '../../../lib/api';
import { ContentFilters } from '../ContentFilters';
import { ContentStatusControls } from '../ContentStatusControls';
import {
  defaultContentFilters,
  type ContentFilters as Filters,
  type QuestionItem,
} from '../cms-types';
import { PaginationControls } from '../PaginationControls';
import { QuestionForm } from './QuestionForm';

const emptyPage = {
  items: [] as QuestionItem[],
  meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

const preview = (value: string) => value.length > 120 ? `${value.slice(0, 117)}…` : value;

export default function QuestionsPage() {
  const [page, setPage] = useState(emptyPage);
  const [filters, setFilters] = useState<Filters>(defaultContentFilters);
  const [editing, setEditing] = useState<QuestionItem | undefined>();
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setPage(await adminGet<PaginatedResponse<QuestionItem>>('/admin/questions', filters));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load questions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [filters]);

  const updateStatus = async (item: QuestionItem, changes: Record<string, boolean>) => {
    try {
      await adminMutation(`/admin/questions/${item.id}`, 'PATCH', changes);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update question.');
    }
  };

  const closeForm = () => { setCreating(false); setEditing(undefined); };

  return (
    <div>
      <div className="card">
        <h1>QBank questions</h1>
        <button onClick={() => { setEditing(undefined); setCreating(true); }}>Create question</button>
        <ContentFilters kind="questions" value={filters} onChange={setFilters} />
        {error && <p>{error}</p>}
        {loading ? <p className="muted">Loading…</p> : page.items.length === 0 ? <p className="muted">No questions found.</p> : (
          <table>
            <thead><tr><th>Question</th><th>Source</th><th>Hierarchy</th><th>Difficulty</th><th>Access</th><th>Publication</th><th>Activity</th><th>Actions</th></tr></thead>
            <tbody>{page.items.map((item) => (
              <tr key={item.id}>
                <td>{preview(item.stem)}</td>
                <td>{item.sourceType}{item.pyqMetadata ? ` · ${item.pyqMetadata.year} #${item.pyqMetadata.questionNumber}` : ''}</td>
                <td>{item.subjectId} / {item.chapterId} / {item.topicId}</td>
                <td>{item.difficulty}</td>
                <td>{item.isFree ? 'Free' : 'Premium'}</td>
                <td>{item.isPublished ? 'Published' : 'Draft'}</td>
                <td>{item.isActive ? 'Active' : 'Inactive'}</td>
                <td>
                  <button onClick={() => { setCreating(false); setEditing(item); }}>Edit</button>{' '}
                  <ContentStatusControls item={item} premium="isFree" onChange={(changes) => void updateStatus(item, changes)} />
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <PaginationControls meta={page.meta} onPageChange={(nextPage) => setFilters((current) => ({ ...current, page: nextPage }))} />
      </div>
      {(creating || editing) && (
        <QuestionForm key={editing?.id ?? 'create'} editing={editing} onSaved={() => { closeForm(); void load(); }} onCancel={closeForm} />
      )}
    </div>
  );
}
