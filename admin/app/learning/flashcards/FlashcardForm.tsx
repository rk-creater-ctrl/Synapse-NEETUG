'use client';

import { useState } from 'react';
import { adminMutation } from '../../../lib/api';
import { HierarchySelector } from '../HierarchySelector';
import { MediaAssetSelector } from '../MediaAssetSelector';
import type { FlashcardItem, HierarchyValue } from '../cms-types';

type FlashcardDraft = HierarchyValue & {
  title: string;
  frontContent: string;
  backContent: string;
  explanation: string;
  mediaAssetId: string | null;
  sortOrder: number | '';
  isPublished: boolean;
  isActive: boolean;
  isPremium: boolean;
};

const emptyDraft: FlashcardDraft = {
  title: '', frontContent: '', backContent: '', explanation: '', mediaAssetId: null, sortOrder: 0,
  isPublished: false, isActive: true, isPremium: false,
};

export function FlashcardForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing?: FlashcardItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FlashcardDraft>(() => editing
    ? {
        ...emptyDraft,
        ...editing,
        title: editing.title ?? '',
        explanation: editing.explanation ?? '',
        mediaAssetId: editing.mediaAssetId ?? null,
      }
    : emptyDraft,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof FlashcardDraft>(key: K, value: FlashcardDraft[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await adminMutation(
        `/admin/learning/flashcards${editing ? `/${editing.id}` : ''}`,
        editing ? 'PATCH' : 'POST',
        {
          ...form,
          title: form.title || undefined,
          explanation: form.explanation || undefined,
          subtopicId: form.subtopicId || undefined,
          sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
        },
      );
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save flashcard.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>{editing ? 'Edit' : 'Create'} flashcard</h2>
      {error && <p>{error}</p>}
      <div className="row">
        <input placeholder="Title (optional)" value={form.title} onChange={(event) => update('title', event.target.value)} />
        <HierarchySelector value={form} onChange={(next) => setForm((current) => ({ ...current, ...next }))} />
      </div>
      <textarea required placeholder="Front / question" value={form.frontContent} onChange={(event) => update('frontContent', event.target.value)} />
      <textarea required placeholder="Back / answer" value={form.backContent} onChange={(event) => update('backContent', event.target.value)} />
      <textarea placeholder="Explanation (optional)" value={form.explanation} onChange={(event) => update('explanation', event.target.value)} />
      <MediaAssetSelector value={form.mediaAssetId} onChange={(value) => update('mediaAssetId', value)} />
      <div className="row">
        <input type="number" min="0" placeholder="Sort order" value={form.sortOrder} onChange={(event) => update('sortOrder', event.target.value === '' ? '' : Number(event.target.value))} />
        <label><input type="checkbox" checked={form.isPublished} onChange={(event) => update('isPublished', event.target.checked)} /> Published</label>
        <label><input type="checkbox" checked={form.isActive} onChange={(event) => update('isActive', event.target.checked)} /> Active</label>
        <label><input type="checkbox" checked={form.isPremium} onChange={(event) => update('isPremium', event.target.checked)} /> Premium</label>
      </div>
      <button disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>{' '}
      <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
    </form>
  );
}
