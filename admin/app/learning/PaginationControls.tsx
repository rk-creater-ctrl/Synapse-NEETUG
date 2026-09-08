'use client';

import type { PaginationMeta } from '../../lib/api';

export function PaginationControls({
  meta,
  onPageChange,
}: {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="row">
      <span className="muted">
        {meta.total} result{meta.total === 1 ? '' : 's'} · page {meta.page} of {Math.max(1, meta.totalPages)}
      </span>
      <button disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
        Previous
      </button>
      <button
        disabled={meta.totalPages === 0 || meta.page >= meta.totalPages}
        onClick={() => onPageChange(meta.page + 1)}
      >
        Next
      </button>
    </div>
  );
}
