'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminMutation, type PaginatedResponse } from '../../lib/api';
import type { MediaAsset } from '../learning/cms-types';
import { PaginationControls } from '../learning/PaginationControls';

type AssetDraft = {
  provider: string;
  externalKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number | '';
  metadata: string;
  isActive: boolean;
};

const emptyPage = { items: [] as MediaAsset[], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
const emptyDraft: AssetDraft = {
  provider: '', externalKey: '', url: '', mimeType: '', sizeBytes: '', metadata: '', isActive: true,
};

export default function MediaAssetsPage() {
  const [page, setPage] = useState(emptyPage);
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [isActive, setIsActive] = useState<boolean | undefined>();
  const [currentPage, setCurrentPage] = useState(1);
  const [editing, setEditing] = useState<MediaAsset>();
  const [draft, setDraft] = useState<AssetDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setPage(await adminGet<PaginatedResponse<MediaAsset>>('/admin/media-assets', {
        search, provider, mimeType, isActive, page: currentPage, limit: 20,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load media assets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [search, provider, mimeType, isActive, currentPage]);

  const reset = () => { setEditing(undefined); setDraft(emptyDraft); };
  const startEdit = (asset: MediaAsset) => {
    setEditing(asset);
    setDraft({
      provider: asset.provider,
      externalKey: asset.externalKey,
      url: asset.url ?? '',
      mimeType: asset.mimeType ?? '',
      sizeBytes: asset.sizeBytes ?? '',
      metadata: asset.metadata ? JSON.stringify(asset.metadata, null, 2) : '',
      isActive: asset.isActive,
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    let metadata: Record<string, unknown> | undefined;
    if (draft.metadata.trim()) {
      try {
        const parsed: unknown = JSON.parse(draft.metadata);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new Error('Metadata must be a JSON object.');
        }
        metadata = parsed as Record<string, unknown>;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Metadata must be valid JSON.');
        return;
      }
    }
    setSaving(true);
    try {
      await adminMutation(
        `/admin/media-assets${editing ? `/${editing.id}` : ''}`,
        editing ? 'PATCH' : 'POST',
        {
          provider: draft.provider,
          externalKey: draft.externalKey,
          url: draft.url || undefined,
          mimeType: draft.mimeType || undefined,
          sizeBytes: draft.sizeBytes === '' ? undefined : Number(draft.sizeBytes),
          metadata,
          isActive: draft.isActive,
        },
      );
      reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save media asset.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (asset: MediaAsset) => {
    if (asset.isActive && !window.confirm('Deactivate this media asset?')) return;
    try {
      await adminMutation(`/admin/media-assets/${asset.id}`, 'PATCH', { isActive: !asset.isActive });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update media asset.');
    }
  };

  const resetPage = (action: () => void) => { setCurrentPage(1); action(); };
  return (
    <div>
      <div className="card">
        <h1>Media assets</h1>
        <div className="row">
          <input placeholder="Search provider, key, or URL" value={search} onChange={(event) => resetPage(() => setSearch(event.target.value))} />
          <input placeholder="Provider" value={provider} onChange={(event) => resetPage(() => setProvider(event.target.value))} />
          <input placeholder="MIME type" value={mimeType} onChange={(event) => resetPage(() => setMimeType(event.target.value))} />
          <select value={isActive === undefined ? '' : String(isActive)} onChange={(event) => resetPage(() => setIsActive(event.target.value === '' ? undefined : event.target.value === 'true'))}>
            <option value="">All activity states</option><option value="true">Active</option><option value="false">Inactive</option>
          </select>
          <button onClick={reset}>Create media asset</button>
        </div>
        {error && <p>{error}</p>}
        {loading ? <p className="muted">Loading…</p> : page.items.length === 0 ? <p className="muted">No media assets found.</p> : (
          <table><thead><tr><th>Provider</th><th>External key</th><th>MIME type</th><th>State</th><th>Actions</th></tr></thead>
            <tbody>{page.items.map((asset) => <tr key={asset.id}><td>{asset.provider}</td><td>{asset.externalKey}</td><td>{asset.mimeType ?? '—'}</td><td>{asset.isActive ? 'Active' : 'Inactive'}</td><td><button onClick={() => startEdit(asset)}>Edit</button>{' '}<button onClick={() => void toggle(asset)}>{asset.isActive ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody>
          </table>
        )}
        <PaginationControls meta={page.meta} onPageChange={setCurrentPage} />
      </div>
      <form className="card" onSubmit={submit}>
        <h2>{editing ? 'Edit' : 'Create'} media asset</h2>
        <div className="row">
          <input required placeholder="Provider" value={draft.provider} onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value }))} />
          <input required placeholder="External key" value={draft.externalKey} onChange={(event) => setDraft((current) => ({ ...current, externalKey: event.target.value }))} />
          <input placeholder="URL (optional)" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} />
          <input placeholder="MIME type" value={draft.mimeType} onChange={(event) => setDraft((current) => ({ ...current, mimeType: event.target.value }))} />
          <input type="number" min="0" placeholder="Size bytes" value={draft.sizeBytes} onChange={(event) => setDraft((current) => ({ ...current, sizeBytes: event.target.value === '' ? '' : Number(event.target.value) }))} />
        </div>
        <textarea placeholder="Metadata JSON object (optional)" value={draft.metadata} onChange={(event) => setDraft((current) => ({ ...current, metadata: event.target.value }))} />
        <label><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
        <button disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>{' '}<button type="button" disabled={saving} onClick={reset}>Cancel</button>
      </form>
    </div>
  );
}
