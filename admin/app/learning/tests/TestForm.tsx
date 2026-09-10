'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { adminGet, adminMutation, type PaginatedResponse } from '../../../lib/api';
import { HierarchySelector } from '../HierarchySelector';
import type {
  HierarchyValue,
  QuestionItem,
  TestItem,
  TestSectionItem,
} from '../cms-types';

type SectionDraft = Omit<TestSectionItem, 'id'> & { key: string };
type TestDraft = HierarchyValue & {
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  isPublished: boolean;
  isActive: boolean;
  isFree: boolean;
  availableFrom: string;
  availableUntil: string;
  sections: SectionDraft[];
};

const sectionKey = () => 'section-' + Date.now().toString() + Math.random().toString(16).slice(2);

const emptySection = (order: number): SectionDraft => ({
  key: sectionKey(),
  title: 'Section ' + (order + 1).toString(),
  instructions: '',
  displayOrder: order,
  questions: [],
});

const emptyDraft = (): TestDraft => ({
  title: '',
  description: '',
  instructions: '',
  durationMinutes: 60,
  isPublished: false,
  isActive: true,
  isFree: true,
  availableFrom: '',
  availableUntil: '',
  sections: [emptySection(0)],
});

const localDateTime = (value?: string | null) => value ? value.slice(0, 16) : '';

function draftFromTest(test: TestItem): TestDraft {
  return {
    title: test.title,
    description: test.description ?? '',
    instructions: test.instructions ?? '',
    examId: test.examId,
    subjectId: test.subjectId,
    academicClassId: test.academicClassId,
    chapterId: test.chapterId,
    topicId: test.topicId,
    subtopicId: test.subtopicId,
    durationMinutes: test.durationMinutes,
    isPublished: test.isPublished,
    isActive: test.isActive,
    isFree: test.isFree,
    availableFrom: localDateTime(test.availableFrom),
    availableUntil: localDateTime(test.availableUntil),
    sections: (test.sections ?? []).map((section) => ({
      key: section.id ?? sectionKey(),
      title: section.title,
      instructions: section.instructions ?? '',
      displayOrder: section.displayOrder,
      questions: section.questions.map((question) => ({
        questionId: question.questionId,
        displayOrder: question.displayOrder,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        question: question.question,
      })),
    })),
  };
}

export function TestForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing?: TestItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TestDraft>(() =>
    editing ? draftFromTest(editing) : emptyDraft(),
  );
  const [questionSearch, setQuestionSearch] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [matches, setMatches] = useState<QuestionItem[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedQuestionIds = useMemo(
    () => new Set(form.sections.flatMap((section) => section.questions.map((question) => question.questionId))),
    [form.sections],
  );

  useEffect(() => {
    if (editing) setForm(draftFromTest(editing));
  }, [editing]);

  const normalizeOrders = (sections: SectionDraft[]) =>
    sections.map((section, sectionIndex) => ({
      ...section,
      displayOrder: sectionIndex,
      questions: section.questions.map((question, questionIndex) => ({
        ...question,
        displayOrder: questionIndex,
      })),
    }));

  const updateSection = (key: string, patch: Partial<SectionDraft>) => {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.key === key ? { ...section, ...patch } : section,
      ),
    }));
  };

  const loadQuestions = async () => {
    setLoadingQuestions(true);
    setError('');
    try {
      const response = await adminGet<PaginatedResponse<QuestionItem>>('/admin/questions', {
        search: questionSearch,
        sourceType: sourceType || undefined,
        difficulty: difficulty || undefined,
        examId: form.examId,
        subjectId: form.subjectId,
        academicClassId: form.academicClassId,
        chapterId: form.chapterId,
        topicId: form.topicId,
        isActive: true,
        isPublished: true,
        limit: 100,
      });
      setMatches(response.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load questions.');
    } finally {
      setLoadingQuestions(false);
    }
  };

  const addQuestion = (sectionKeyValue: string, question: QuestionItem) => {
    if (selectedQuestionIds.has(question.id)) return;
    setForm((current) => ({
      ...current,
      sections: normalizeOrders(current.sections.map((section) =>
        section.key === sectionKeyValue
          ? {
              ...section,
              questions: [
                ...section.questions,
                {
                  questionId: question.id,
                  displayOrder: section.questions.length,
                  marks: 4,
                  negativeMarks: 1,
                  question,
                },
              ],
            }
          : section,
      )),
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const sections = normalizeOrders(form.sections);
    if (!form.examId || sections.every((section) => section.questions.length === 0)) {
      setError('Select an exam and add at least one question.');
      return;
    }
    if (form.availableFrom && form.availableUntil && new Date(form.availableFrom) >= new Date(form.availableUntil)) {
      setError('Availability start must be before availability end.');
      return;
    }
    setSaving(true);
    try {
      await adminMutation(
        '/admin/tests' + (editing ? '/' + editing.id : ''),
        editing ? 'PATCH' : 'POST',
        {
          title: form.title.trim(),
          description: form.description.trim() || null,
          instructions: form.instructions.trim() || null,
          examId: form.examId,
          subjectId: form.subjectId || null,
          academicClassId: form.academicClassId || null,
          chapterId: form.chapterId || null,
          topicId: form.topicId || null,
          subtopicId: form.subtopicId || null,
          durationMinutes: form.durationMinutes,
          isPublished: form.isPublished,
          isActive: form.isActive,
          isFree: form.isFree,
          availableFrom: form.availableFrom || null,
          availableUntil: form.availableUntil || null,
          sections: sections.map((section) => ({
            title: section.title.trim(),
            instructions: section.instructions?.trim() || undefined,
            displayOrder: section.displayOrder,
            questions: section.questions.map(({ questionId, displayOrder, marks, negativeMarks }) => ({
              questionId,
              displayOrder,
              marks,
              negativeMarks,
            })),
          })),
        },
      );
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save test.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>{editing ? 'Edit test' : 'Create test'}</h2>
      {error && <p>{error}</p>}
      <input required placeholder="Test title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
      <textarea placeholder="Description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
      <textarea placeholder="Instructions" value={form.instructions} onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))} />
      <div className="row">
        <HierarchySelector value={form} onChange={(next) => setForm((current) => ({ ...current, ...next }))} />
        <label>Duration (minutes)<input required type="number" min="1" value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} /></label>
        <label>Available from<input type="datetime-local" value={form.availableFrom} onChange={(event) => setForm((current) => ({ ...current, availableFrom: event.target.value }))} /></label>
        <label>Available until<input type="datetime-local" value={form.availableUntil} onChange={(event) => setForm((current) => ({ ...current, availableUntil: event.target.value }))} /></label>
        <label><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))} /> Published</label>
        <label><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
        <label><input type="checkbox" checked={form.isFree} onChange={(event) => setForm((current) => ({ ...current, isFree: event.target.checked }))} /> Free</label>
      </div>
      <h3>Question selector</h3>
      <div className="row">
        <input placeholder="Search questions" value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} />
        <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option value="">All sources</option><option value="CURATED">CURATED</option><option value="PYQ">PYQ</option></select>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="">All difficulties</option><option value="EASY">EASY</option><option value="MEDIUM">MEDIUM</option><option value="HARD">HARD</option></select>
        <button type="button" onClick={() => void loadQuestions()} disabled={loadingQuestions}>{loadingQuestions ? 'Loading…' : 'Find questions'}</button>
      </div>
      {form.sections.map((section, sectionIndex) => (
        <fieldset key={section.key}>
          <legend>Section {sectionIndex + 1}</legend>
          <div className="row">
            <input required placeholder="Section title" value={section.title} onChange={(event) => updateSection(section.key, { title: event.target.value })} />
            <input placeholder="Section instructions" value={section.instructions ?? ''} onChange={(event) => updateSection(section.key, { instructions: event.target.value })} />
            <button type="button" disabled={form.sections.length === 1} onClick={() => setForm((current) => ({ ...current, sections: normalizeOrders(current.sections.filter((item) => item.key !== section.key)) }))}>Remove section</button>
          </div>
          {matches.filter((question) => !selectedQuestionIds.has(question.id)).map((question) => (
            <p key={question.id}>{question.stem.slice(0, 120)} ({question.sourceType} · {question.difficulty}) <button type="button" onClick={() => addQuestion(section.key, question)}>Add</button></p>
          ))}
          {section.questions.map((question, questionIndex) => (
            <div className="row" key={question.questionId}>
              <span>{questionIndex + 1}. {question.question?.stem ?? question.questionId}</span>
              <label>Marks<input type="number" min="0" value={question.marks} onChange={(event) => updateSection(section.key, { questions: section.questions.map((item) => item.questionId === question.questionId ? { ...item, marks: Number(event.target.value) } : item) })} /></label>
              <label>Negative magnitude<input type="number" min="0" value={question.negativeMarks} onChange={(event) => updateSection(section.key, { questions: section.questions.map((item) => item.questionId === question.questionId ? { ...item, negativeMarks: Number(event.target.value) } : item) })} /></label>
              <button type="button" onClick={() => setForm((current) => ({ ...current, sections: normalizeOrders(current.sections.map((item) => item.key === section.key ? { ...item, questions: item.questions.filter((candidate) => candidate.questionId !== question.questionId) } : item)) }))}>Remove</button>
            </div>
          ))}
        </fieldset>
      ))}
      <button type="button" onClick={() => setForm((current) => ({ ...current, sections: [...current.sections, emptySection(current.sections.length)] }))}>Add section</button>{' '}
      <button disabled={saving}>{saving ? 'Saving…' : 'Save test'}</button>{' '}
      <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
    </form>
  );
}
