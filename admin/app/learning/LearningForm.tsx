'use client';

import { useState } from 'react';
import { adminMutation } from '../../lib/api';
import { HierarchySelector } from './HierarchySelector';
import { MediaAssetSelector } from './MediaAssetSelector';
import type { HierarchyValue, RevisionItem, RevisionType, VideoItem } from './cms-types';

type Kind = 'videos' | 'revision';
type VideoDraft = HierarchyValue & {
  title: string;
  slug: string;
  description: string;
  instructorName: string;
  provider: string;
  providerAssetId: string;
  playbackId: string;
  mediaAssetId: string | null;
  durationSeconds: number | '';
  displayOrder: number | '';
  isFree: boolean;
  isPublished: boolean;
  isActive: boolean;
};
type RevisionDraft = HierarchyValue & {
  title: string;
  type: RevisionType;
  content: string;
  displayOrder: number | '';
  isPublished: boolean;
  isActive: boolean;
};

const revisionTypes: RevisionType[] = [
  'FORMULA',
  'REACTION',
  'BIOLOGY_FACT',
  'NCERT_HIGHLIGHT',
  'SHORT_NOTE',
];

const emptyVideo: VideoDraft = {
  title: '', slug: '', description: '', instructorName: '', provider: 'LOCAL',
  providerAssetId: '', playbackId: '', durationSeconds: '', displayOrder: 0,
  mediaAssetId: null,
  isFree: true, isPublished: false, isActive: true,
};
const emptyRevision: RevisionDraft = {
  title: '', type: 'FORMULA', content: '', displayOrder: 0,
  isPublished: false, isActive: true,
};

function videoDraft(item?: VideoItem): VideoDraft {
  return item
    ? {
        ...emptyVideo,
        ...item,
        description: item.description ?? '',
        instructorName: item.instructorName ?? '',
        playbackId: item.playbackId ?? '',
        mediaAssetId: item.mediaAssetId ?? null,
        durationSeconds: item.durationSeconds ?? '',
      }
    : emptyVideo;
}

function revisionDraft(item?: RevisionItem): RevisionDraft {
  return item ? { ...emptyRevision, ...item } : emptyRevision;
}

export function LearningForm({
  kind,
  editing,
  onSaved,
  onCancel,
}: {
  kind: Kind;
  editing?: VideoItem | RevisionItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isVideo = kind === 'videos';
  const [video, setVideo] = useState<VideoDraft>(() =>
    videoDraft(isVideo ? editing as VideoItem | undefined : undefined),
  );
  const [revision, setRevision] = useState<RevisionDraft>(() =>
    revisionDraft(!isVideo ? editing as RevisionItem | undefined : undefined),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const form = isVideo ? video : revision;

  const update = <K extends keyof (VideoDraft & RevisionDraft)>(
    key: K,
    value: (VideoDraft & RevisionDraft)[K],
  ) => {
    if (isVideo) setVideo((current) => ({ ...current, [key]: value } as VideoDraft));
    else setRevision((current) => ({ ...current, [key]: value } as RevisionDraft));
  };

  const updateHierarchy = (next: HierarchyValue) => {
    if (isVideo) setVideo((current) => ({ ...current, ...next }));
    else setRevision((current) => ({ ...current, ...next }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const path = `/admin/learning/${kind}${editing ? `/${editing.id}` : ''}`;
      const method = editing ? 'PATCH' : 'POST';
      const body = isVideo
        ? {
            ...video,
            durationSeconds: video.durationSeconds === '' ? undefined : Number(video.durationSeconds),
            displayOrder: video.displayOrder === '' ? 0 : Number(video.displayOrder),
            playbackId: video.playbackId || undefined,
            description: video.description || undefined,
            instructorName: video.instructorName || undefined,
            subtopicId: video.subtopicId || undefined,
          }
        : {
            ...revision,
            displayOrder: revision.displayOrder === '' ? 0 : Number(revision.displayOrder),
            subtopicId: revision.subtopicId || undefined,
          };
      await adminMutation(path, method, body);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>{editing ? 'Edit' : 'Create'} {isVideo ? 'video' : 'revision item'}</h2>
      {error && <p>{error}</p>}
      <div className="row">
        <input required placeholder="Title" value={form.title} onChange={(event) => update('title', event.target.value)} />
        {isVideo && (
          <input required placeholder="Slug" value={video.slug} onChange={(event) => update('slug', event.target.value)} />
        )}
        <HierarchySelector value={form} onChange={updateHierarchy} />
      </div>
      {isVideo ? (
        <div className="row">
          <textarea placeholder="Description" value={video.description} onChange={(event) => update('description', event.target.value)} />
          <input placeholder="Instructor" value={video.instructorName} onChange={(event) => update('instructorName', event.target.value)} />
          <select value={video.provider} onChange={(event) => update('provider', event.target.value)}>
            <option value="LOCAL">LOCAL</option><option value="MOCK">MOCK</option>
            <option value="MUX">MUX</option><option value="CLOUDFLARE_STREAM">CLOUDFLARE_STREAM</option>
          </select>
          <input required placeholder="Provider asset / URL" value={video.providerAssetId} onChange={(event) => update('providerAssetId', event.target.value)} />
          <input placeholder="Playback ID" value={video.playbackId} onChange={(event) => update('playbackId', event.target.value)} />
          <MediaAssetSelector value={video.mediaAssetId} onChange={(value) => update('mediaAssetId', value)} />
          <input type="number" min="0" placeholder="Duration seconds" value={video.durationSeconds} onChange={(event) => update('durationSeconds', event.target.value === '' ? '' : Number(event.target.value))} />
        </div>
      ) : (
        <div className="row">
          <select value={revision.type} onChange={(event) => update('type', event.target.value as RevisionType)}>
            {revisionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <textarea required placeholder="Content" value={revision.content} onChange={(event) => update('content', event.target.value)} />
        </div>
      )}
      <div className="row">
        <input type="number" min="0" placeholder="Display order" value={form.displayOrder} onChange={(event) => update('displayOrder', event.target.value === '' ? '' : Number(event.target.value))} />
        <label><input type="checkbox" checked={form.isPublished} onChange={(event) => update('isPublished', event.target.checked)} /> Published</label>
        <label><input type="checkbox" checked={form.isActive} onChange={(event) => update('isActive', event.target.checked)} /> Active</label>
        {isVideo && <label><input type="checkbox" checked={video.isFree} onChange={(event) => update('isFree', event.target.checked)} /> Free</label>}
      </div>
      <button disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>{' '}
      <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
    </form>
  );
}
