'use client';

import { useEffect, useState } from 'react';
import {
  adminGet,
  adminMutation,
  type AcademicListResponse,
} from '../../../lib/api';
import { PaginationControls } from '../../learning/PaginationControls';

type Resource = 'exams' | 'subjects' | 'classes' | 'chapters' | 'topics' | 'subtopics';
type AcademicRecord = {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
  isPublished: boolean;
  examId?: string;
  subjectId?: string;
  classId?: string;
  chapterId?: string;
  topicId?: string;
};
type ParentConfig = { resource: Resource; field: keyof AcademicRecord; label: string };

const parents: Partial<Record<Resource, ParentConfig>> = {
  subjects: { resource: 'exams', field: 'examId', label: 'Exam' },
  classes: { resource: 'subjects', field: 'subjectId', label: 'Subject' },
  chapters: { resource: 'classes', field: 'classId', label: 'Class' },
  topics: { resource: 'chapters', field: 'chapterId', label: 'Chapter' },
  subtopics: { resource: 'topics', field: 'topicId', label: 'Topic' },
};

const emptyMeta = { page: 1, limit: 20, total: 0, totalPages: 0 };

export default function AcademicPage({ params }: { params: Promise<{ resource: Resource }> }) {
  const [resource, setResource] = useState<Resource>();
  const [records, setRecords] = useState<AcademicRecord[]>([]);
  const [meta, setMeta] = useState(emptyMeta);
  const [parentOptions, setParentOptions] = useState<AcademicRecord[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    name: '', slug: '', displayOrder: 0, parentId: '', isActive: true, isPublished: true,
  });
  const [editing, setEditing] = useState<AcademicRecord>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void params.then((resolved) => setResource(resolved.resource));
  }, [params]);

  const load = async (targetPage = page) => {
    if (!resource) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminGet<AcademicListResponse<AcademicRecord>>(
        `/admin/academics/${resource}`,
        { search, page: targetPage, limit: 20 },
      );
      setRecords(response.data);
      setMeta(response.meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load academic records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [resource, page]);

  useEffect(() => {
    if (!resource || !parents[resource]) {
      setParentOptions([]);
      return;
    }
    const parent = parents[resource]!;
    void adminGet<AcademicListResponse<AcademicRecord>>(
      `/admin/academics/${parent.resource}`,
      { limit: 100 },
    ).then((response) => setParentOptions(response.data)).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'Unable to load parent records.');
    });
  }, [resource]);

  const resetForm = () => {
    setEditing(undefined);
    setForm({ name: '', slug: '', displayOrder: 0, parentId: '', isActive: true, isPublished: true });
  };

  const edit = (record: AcademicRecord) => {
    const parent = resource ? parents[resource] : undefined;
    setEditing(record);
    setForm({
      name: record.name,
      slug: record.slug,
      displayOrder: record.displayOrder,
      parentId: parent ? String(record[parent.field] ?? '') : '',
      isActive: record.isActive,
      isPublished: record.isPublished,
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resource) return;
    setError('');
    const parent = parents[resource];
    const body: Record<string, unknown> = {
      name: form.name,
      slug: form.slug || form.name.toLowerCase().trim().replace(/\s+/g, '-'),
      displayOrder: Number(form.displayOrder),
      isActive: form.isActive,
      isPublished: form.isPublished,
    };
    if (parent) body[parent.field] = form.parentId;
    try {
      await adminMutation(
        `/admin/academics/${resource}${editing ? `/${editing.id}` : ''}`,
        editing ? 'PATCH' : 'POST',
        body,
      );
      resetForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save academic record.');
    }
  };

  const updateStatus = async (record: AcademicRecord, changes: Partial<Pick<AcademicRecord, 'isActive' | 'isPublished'>>) => {
    if (changes.isActive === false && record.isActive && !window.confirm(`Deactivate ${record.name}?`)) return;
    if (!resource) return;
    try {
      await adminMutation(`/admin/academics/${resource}/${record.id}`, 'PATCH', changes);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update academic record.');
    }
  };

  const parent = resource ? parents[resource] : undefined;
  return (
    <div className="card">
      <h1>{resource ?? 'Academics'}</h1>
      <div className="row">
        <input value={search} placeholder="Search" onChange={(event) => setSearch(event.target.value)} />
        <button onClick={() => { setPage(1); void load(1); }}>Search</button>
      </div>
      <form onSubmit={submit} className="row">
        <input required value={form.name} placeholder="Name" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        <input value={form.slug} placeholder="Slug (optional)" onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} />
        <input type="number" min="0" value={form.displayOrder} placeholder="Order" onChange={(event) => setForm((current) => ({ ...current, displayOrder: Number(event.target.value) }))} />
        {parent && <select required value={form.parentId} onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}><option value="">Select {parent.label}</option>{parentOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>}
        <label><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
        <label><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))} /> Published</label>
        <button>{editing ? 'Save changes' : 'Create'}</button>
        {editing && <button type="button" onClick={resetForm}>Cancel</button>}
      </form>
      {error && <p>{error}</p>}
      {loading ? <p className="muted">Loading…</p> : records.length === 0 ? <p className="muted">No records found.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Slug</th><th>Order</th><th>Publication</th><th>Activity</th><th>Actions</th></tr></thead>
          <tbody>{records.map((record) => <tr key={record.id}>
            <td>{record.name}</td><td>{record.slug}</td><td>{record.displayOrder}</td>
            <td>{record.isPublished ? 'Published' : 'Draft'}</td><td>{record.isActive ? 'Active' : 'Inactive'}</td>
            <td><button onClick={() => edit(record)}>Edit</button>{' '}<button onClick={() => void updateStatus(record, { isPublished: !record.isPublished })}>{record.isPublished ? 'Unpublish' : 'Publish'}</button>{' '}<button onClick={() => void updateStatus(record, { isActive: !record.isActive })}>{record.isActive ? 'Deactivate' : 'Activate'}</button></td>
          </tr>)}</tbody>
        </table>
      )}
      <PaginationControls meta={meta} onPageChange={setPage} />
    </div>
  );
}
