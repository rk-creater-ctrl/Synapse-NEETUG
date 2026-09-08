'use client';

import type { ContentStatus } from './cms-types';

export function ContentStatusControls({
  item,
  onChange,
  premium,
}: {
  item: ContentStatus & { isPremium?: boolean; isFree?: boolean };
  onChange: (changes: Record<string, boolean>) => void;
  premium?: 'isPremium' | 'isFree';
}) {
  const deactivate = () => {
    if (!item.isActive || window.confirm('Deactivate this content item?')) {
      onChange({ isActive: !item.isActive });
    }
  };

  return (
    <>
      <button onClick={() => onChange({ isPublished: !item.isPublished })}>
        {item.isPublished ? 'Unpublish' : 'Publish'}
      </button>{' '}
      <button onClick={deactivate}>{item.isActive ? 'Deactivate' : 'Activate'}</button>
      {premium === 'isPremium' && (
        <>
          {' '}<button onClick={() => onChange({ isPremium: !item.isPremium })}>
            {item.isPremium ? 'Make free' : 'Make premium'}
          </button>
        </>
      )}
      {premium === 'isFree' && (
        <>
          {' '}<button onClick={() => onChange({ isFree: !item.isFree })}>
            {item.isFree ? 'Make premium' : 'Make free'}
          </button>
        </>
      )}
    </>
  );
}
