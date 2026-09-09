'use client';

import type { ChangeEvent } from 'react';
import { HierarchySelector } from './HierarchySelector';
import type {
  ContentFilters as Filters,
  HierarchyValue,
  QuestionDifficulty,
  QuestionSourceType,
  RevisionType,
} from './cms-types';

type FilterKind = 'videos' | 'revision' | 'flashcards' | 'questions';

const revisionTypes: RevisionType[] = [
  'FORMULA',
  'REACTION',
  'BIOLOGY_FACT',
  'NCERT_HIGHLIGHT',
  'SHORT_NOTE',
];

const questionDifficulties: QuestionDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const questionSources: QuestionSourceType[] = ['CURATED', 'PYQ'];

const booleanValue = (event: ChangeEvent<HTMLSelectElement>): boolean | undefined => {
  if (event.target.value === '') return undefined;
  return event.target.value === 'true';
};

export function ContentFilters({
  kind,
  value,
  onChange,
}: {
  kind: FilterKind;
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  const update = <K extends keyof Filters>(key: K, nextValue: Filters[K]) => {
    onChange({ ...value, [key]: nextValue, page: 1 });
  };
  const hierarchyValue: HierarchyValue = {
    examId: value.examId,
    subjectId: value.subjectId,
    academicClassId: value.classId,
    chapterId: value.chapterId,
    topicId: value.topicId,
    subtopicId: value.subtopicId,
  };

  const updateHierarchy = (next: HierarchyValue) => {
    onChange({
      ...value,
      page: 1,
      examId: next.examId,
      subjectId: next.subjectId,
      classId: next.academicClassId,
      chapterId: next.chapterId,
      topicId: next.topicId,
      subtopicId: next.subtopicId,
    });
  };

  return (
    <div className="row">
      <input
        placeholder="Search"
        value={value.search}
        onChange={(event) => update('search', event.target.value)}
      />
      <HierarchySelector value={hierarchyValue} onChange={updateHierarchy} required={false} />
      <select
        value={value.isPublished === undefined ? '' : String(value.isPublished)}
        onChange={(event) => update('isPublished', booleanValue(event))}
      >
        <option value="">All publication states</option>
        <option value="true">Published</option>
        <option value="false">Draft</option>
      </select>
      <select
        value={value.isActive === undefined ? '' : String(value.isActive)}
        onChange={(event) => update('isActive', booleanValue(event))}
      >
        <option value="">All activity states</option>
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>
      {kind !== 'revision' && (
        <select
          value={value.isPremium === undefined ? '' : String(value.isPremium)}
          onChange={(event) => update('isPremium', booleanValue(event))}
        >
          <option value="">Free and premium</option>
          <option value="false">Free</option>
          <option value="true">Premium</option>
        </select>
      )}
      {kind === 'revision' && (
        <select
          value={value.type ?? ''}
          onChange={(event) => update('type', event.target.value as RevisionType || undefined)}
        >
          <option value="">All revision types</option>
          {revisionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      )}
      {kind === 'videos' && (
        <select
          value={value.provider ?? ''}
          onChange={(event) => update('provider', event.target.value || undefined)}
        >
          <option value="">All providers</option>
          <option value="LOCAL">LOCAL</option>
          <option value="MOCK">MOCK</option>
          <option value="MUX">MUX</option>
          <option value="CLOUDFLARE_STREAM">CLOUDFLARE_STREAM</option>
        </select>
      )}
      {kind === 'questions' && (
        <>
          <select
            value={value.sourceType ?? ''}
            onChange={(event) => update('sourceType', event.target.value as QuestionSourceType || undefined)}
          >
            <option value="">All sources</option>
            {questionSources.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
          <select
            value={value.difficulty ?? ''}
            onChange={(event) => update('difficulty', event.target.value as QuestionDifficulty || undefined)}
          >
            <option value="">All difficulties</option>
            {questionDifficulties.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}
          </select>
          <input
            type="number"
            min="1900"
            max="2100"
            placeholder="PYQ year"
            value={value.pyqYear ?? ''}
            onChange={(event) => update('pyqYear', event.target.value === '' ? undefined : Number(event.target.value))}
          />
        </>
      )}
    </div>
  );
}
