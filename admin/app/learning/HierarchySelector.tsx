'use client';

import { useEffect, useState } from 'react';
import { adminGet, type AcademicListResponse } from '../../lib/api';
import type { AcademicOption, HierarchyValue } from './cms-types';

type Field = keyof HierarchyValue;

const configuration: Array<{
  field: Field;
  resource: string;
  label: string;
  parent?: Field;
  parentQuery?: string;
}> = [
  { field: 'examId', resource: 'exams', label: 'Exam' },
  {
    field: 'subjectId',
    resource: 'subjects',
    label: 'Subject',
    parent: 'examId',
    parentQuery: 'examId',
  },
  {
    field: 'academicClassId',
    resource: 'classes',
    label: 'Class',
    parent: 'subjectId',
    parentQuery: 'subjectId',
  },
  {
    field: 'chapterId',
    resource: 'chapters',
    label: 'Chapter',
    parent: 'academicClassId',
    parentQuery: 'classId',
  },
  {
    field: 'topicId',
    resource: 'topics',
    label: 'Topic',
    parent: 'chapterId',
    parentQuery: 'chapterId',
  },
  {
    field: 'subtopicId',
    resource: 'subtopics',
    label: 'Subtopic',
    parent: 'topicId',
    parentQuery: 'topicId',
  },
];

export function HierarchySelector({
  value,
  onChange,
  required = true,
  includeSubtopic = true,
}: {
  value: HierarchyValue;
  onChange: (value: HierarchyValue) => void;
  required?: boolean;
  includeSubtopic?: boolean;
}) {
  const [options, setOptions] = useState<Partial<Record<Field, AcademicOption[]>>>({});
  const [error, setError] = useState('');
  const levels = includeSubtopic ? configuration : configuration.slice(0, -1);

  useEffect(() => {
    let active = true;
    const load = async () => {
      for (const level of levels) {
        const parentId = level.parent ? value[level.parent] : undefined;
        if (level.parent && !parentId) {
          if (active) setOptions((current) => ({ ...current, [level.field]: [] }));
          continue;
        }
        try {
          const response = await adminGet<AcademicListResponse<AcademicOption>>(
            `/admin/academics/${level.resource}`,
            level.parentQuery ? { [level.parentQuery]: parentId, limit: 100 } : { limit: 100 },
          );
          if (active) {
            setOptions((current) => ({ ...current, [level.field]: response.data }));
          }
        } catch (cause) {
          if (active) {
            setError(cause instanceof Error ? cause.message : 'Unable to load academic options.');
          }
          return;
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [value.examId, value.subjectId, value.academicClassId, value.chapterId, value.topicId, includeSubtopic]);

  const update = (field: Field, selected: string) => {
    const index = configuration.findIndex((level) => level.field === field);
    const next: HierarchyValue = { ...value, [field]: selected || undefined };
    for (const child of configuration.slice(index + 1)) {
      next[child.field] = undefined;
    }
    onChange(next);
  };

  return (
    <>
      {levels.map((level) => {
        const disabled = Boolean(level.parent && !value[level.parent]);
        return (
          <select
            key={level.field}
            required={required && level.field !== 'subtopicId'}
            disabled={disabled}
            value={value[level.field] ?? ''}
            onChange={(event) => update(level.field, event.target.value)}
          >
            <option value="">Select {level.label}</option>
            {(options[level.field] ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        );
      })}
      {error && <p className="muted">{error}</p>}
    </>
  );
}
