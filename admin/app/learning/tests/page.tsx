'use client';

import { useEffect, useState } from 'react';

import {
  adminGet,
  adminMutation,
  type PaginatedResponse,
  type QueryParams,
} from '../../../lib/api';
import { HierarchySelector } from '../HierarchySelector';
import { PaginationControls } from '../PaginationControls';
import type { HierarchyValue, TestItem } from '../cms-types';
import { TestForm } from './TestForm';

const emptyPage: PaginatedResponse<TestItem> = {
  items: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

type TestFilters = HierarchyValue & {
  page: number;
  limit: number;
  search: string;
  isPublished?: boolean;
  isActive?: boolean;
  isFree?: boolean;
  availability?: 'SCHEDULED' | 'AVAILABLE' | 'ENDED';
};

const initialFilters: TestFilters = { page: 1, limit: 20, search: '' };

export default function TestsPage() {
  const [filters, setFilters] = useState<TestFilters>(initialFilters);
  const [page, setPage] = useState(emptyPage);
  const [editing, setEditing] = useState<TestItem | undefined>();
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const query: QueryParams = {
        ...filters,
        classId: undefined,
        academicClassId: filters.academicClassId,
      };
      setPage(await adminGet<PaginatedResponse<TestItem>>('/admin/tests', query));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load tests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filters]);

  const update = <K extends keyof TestFilters>(key: K, value: TestFilters[K]) => {
    setFilters((current) => ({ ...current, page: 1, [key]: value }));
  };

  const statusValue = (value: boolean | undefined) =>
    value === undefined ? '' : String(value);

  return (
    <div>
      <div className="card">
        <h1>Formal tests</h1>
        <button
          onClick={() => {
            setEditing(undefined);
            setCreating(true);
          }}
        >
          Create test
        </button>
        <div className="row">
          <input
            placeholder="Search tests"
            value={filters.search}
            onChange={(event) => update('search', event.target.value)}
          />
          <HierarchySelector
            required={false}
            value={filters}
            onChange={(next) =>
              setFilters((current) => ({ ...current, ...next, page: 1 }))
            }
          />
          <select
            value={statusValue(filters.isPublished)}
            onChange={(event) =>
              update(
                'isPublished',
                event.target.value === ''
                  ? undefined
                  : event.target.value === 'true',
              )
            }
          >
            <option value="">All publication states</option>
            <option value="true">Published</option>
            <option value="false">Draft</option>
          </select>
          <select
            value={statusValue(filters.isActive)}
            onChange={(event) =>
              update(
                'isActive',
                event.target.value === ''
                  ? undefined
                  : event.target.value === 'true',
              )
            }
          >
            <option value="">All activity states</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <select
            value={statusValue(filters.isFree)}
            onChange={(event) =>
              update(
                'isFree',
                event.target.value === ''
                  ? undefined
                  : event.target.value === 'true',
              )
            }
          >
            <option value="">Free and premium</option>
            <option value="true">Free</option>
            <option value="false">Premium</option>
          </select>
          <select
            value={filters.availability ?? ''}
            onChange={(event) =>
              update(
                'availability',
                (event.target.value || undefined) as TestFilters['availability'],
              )
            }
          >
            <option value="">Any schedule</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="AVAILABLE">Available</option>
            <option value="ENDED">Ended</option>
          </select>
        </div>
        {error && <p>{error}</p>}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : page.items.length === 0 ? (
          <p className="muted">No tests found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th><th>Scope</th><th>Duration</th><th>Marks</th>
                <th>Sections</th><th>Access</th><th>State</th><th>Availability</th><th />
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.subjectId ?? item.examId}</td>
                  <td>{item.durationMinutes} min</td>
                  <td>{item.totalMarks}</td>
                  <td>{item._count?.sections ?? '—'}</td>
                  <td>{item.isFree ? 'Free' : 'Premium'}</td>
                  <td>{item.isPublished ? 'Published' : 'Draft'} · {item.isActive ? 'Active' : 'Inactive'}</td>
                  <td>{item.availableFrom ?? 'Open'} → {item.availableUntil ?? 'Open'}</td>
                  <td>
                    <button
                      onClick={async () => {
                        try {
                          setEditing(await adminGet<TestItem>(`/admin/tests/${item.id}`));
                          setCreating(false);
                        } catch (cause) {
                          setError(cause instanceof Error ? cause.message : 'Unable to load test.');
                        }
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <PaginationControls
          meta={page.meta}
          onPageChange={(nextPage) => update('page', nextPage)}
        />
      </div>
      {(creating || editing) && (
        <TestForm
          editing={editing}
          onCancel={() => {
            setCreating(false);
            setEditing(undefined);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(undefined);
            void load();
          }}
        />
      )}
    </div>
  );
}
