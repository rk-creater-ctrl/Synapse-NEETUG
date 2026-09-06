'use client';

import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL!;
type Item = { id: string; name: string };

export function FlashcardForm({ editing, onSaved, onCancel }: { editing?: any; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<any>(editing || { isPublished: false, isActive: true, isPremium: false, sortOrder: 0 });
  const [options, setOptions] = useState<Record<string, Item[]>>({});
  const [error, setError] = useState('');
  const set = (key: string, value: any) => setForm((current: any) => {
    const next = { ...current, [key]: value };
    if (key === 'examId') Object.assign(next, { subjectId: '', academicClassId: '', chapterId: '', topicId: '', subtopicId: '' });
    if (key === 'subjectId') Object.assign(next, { academicClassId: '', chapterId: '', topicId: '', subtopicId: '' });
    if (key === 'academicClassId') Object.assign(next, { chapterId: '', topicId: '', subtopicId: '' });
    if (key === 'chapterId') Object.assign(next, { topicId: '', subtopicId: '' });
    if (key === 'topicId') next.subtopicId = '';
    return next;
  });
  const load = async (path: string, key: string) => { const response = await fetch(`${api}/academics/${path}`); if (response.ok) { const json = await response.json(); setOptions((current) => ({ ...current, [key]: json.data || [] })); } };
  useEffect(() => { load('exams', 'examId'); }, []);
  useEffect(() => { if (form.examId) load(`subjects?examId=${form.examId}`, 'subjectId'); }, [form.examId]);
  useEffect(() => { if (form.subjectId) load(`classes?subjectId=${form.subjectId}`, 'academicClassId'); }, [form.subjectId]);
  useEffect(() => { if (form.academicClassId) load(`chapters?classId=${form.academicClassId}`, 'chapterId'); }, [form.academicClassId]);
  useEffect(() => { if (form.chapterId) load(`topics?chapterId=${form.chapterId}`, 'topicId'); }, [form.chapterId]);
  useEffect(() => { if (form.topicId) load(`subtopics?topicId=${form.topicId}`, 'subtopicId'); }, [form.topicId]);
  const select = (key: string, label: string, required = true) => <select required={required} value={form[key] || ''} onChange={(event) => set(key, event.target.value)}><option value="">Select {label}</option>{(options[key] || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); const token = JSON.parse(localStorage.getItem('synapse_tokens') || '{}').accessToken;
    const response = await fetch(`${api}/admin/learning/flashcards${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...form, sortOrder: Number(form.sortOrder || 0) }) });
    if (!response.ok) { setError('Unable to save. Verify required hierarchy fields.'); return; } onSaved();
  };
  return <form className="card" onSubmit={save}><h2>{editing ? 'Edit' : 'Create'} flashcard</h2>{error && <p>{error}</p>}<div className="row"><input placeholder="Title (optional)" value={form.title || ''} onChange={(event) => set('title', event.target.value)} />{select('examId', 'Exam')}{select('subjectId', 'Subject')}{select('academicClassId', 'Class')}{select('chapterId', 'Chapter')}{select('topicId', 'Topic')}{select('subtopicId', 'Subtopic', false)}</div><textarea required placeholder="Front / question" value={form.frontContent || ''} onChange={(event) => set('frontContent', event.target.value)} /><textarea required placeholder="Back / answer" value={form.backContent || ''} onChange={(event) => set('backContent', event.target.value)} /><textarea placeholder="Explanation (optional)" value={form.explanation || ''} onChange={(event) => set('explanation', event.target.value)} /><input type="number" min="0" placeholder="Sort order" value={form.sortOrder || 0} onChange={(event) => set('sortOrder', event.target.value)} /><label><input type="checkbox" checked={!!form.isPublished} onChange={(event) => set('isPublished', event.target.checked)} /> Published</label><label><input type="checkbox" checked={!!form.isActive} onChange={(event) => set('isActive', event.target.checked)} /> Active</label><label><input type="checkbox" checked={!!form.isPremium} onChange={(event) => set('isPremium', event.target.checked)} /> Premium</label><button>Save</button><button type="button" onClick={onCancel}>Cancel</button></form>;
}
