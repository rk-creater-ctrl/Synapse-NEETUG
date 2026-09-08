'use client';

import { useEffect, useState } from 'react';
import { adminGet, type PaginatedResponse } from '../../lib/api';
import type { MediaAsset } from './cms-types';

export function MediaAssetSelector({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void adminGet<PaginatedResponse<MediaAsset>>('/admin/media-assets', { limit: 100 })
      .then((response) => {
        if (active) setAssets(response.items);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load media assets.');
      });
    return () => { active = false; };
  }, []);

  return (
    <label>
      Media asset
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">No media asset</option>
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id} disabled={!asset.isActive && asset.id !== value}>
            {asset.provider}: {asset.externalKey}{asset.isActive ? '' : ' (inactive)'}
          </option>
        ))}
      </select>
      {error && <span className="muted">{error}</span>}
    </label>
  );
}
