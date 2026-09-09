'use client';

import { useState, type FormEvent } from 'react';

import { adminMutation } from '../../../lib/api';
import { HierarchySelector } from '../HierarchySelector';
import { MediaAssetSelector } from '../MediaAssetSelector';
import type {
  HierarchyValue,
  QuestionDifficulty,
  QuestionItem,
  QuestionOption,
  QuestionPyqMetadata,
  QuestionSourceType,
} from '../cms-types';

type QuestionDraft = HierarchyValue & {
  type: 'SINGLE_CORRECT_MCQ';
  sourceType: QuestionSourceType;
  stem: string;
  explanation: string;
  difficulty: QuestionDifficulty;
  tagsText: string;
  displayOrder: number | '';
  isPublished: boolean;
  isActive: boolean;
  isFree: boolean;
  importKey: string;
  mediaAssetId: string | null;
  solutionVideoId: string | null;
  options: QuestionOption[];
  pyqMetadata: QuestionPyqMetadata;
};

const blankOptions = (): QuestionOption[] => [1, 2, 3, 4].map((position) => ({
  position,
  text: '',
  isCorrect: position === 1,
}));

const blankPyq = (): QuestionPyqMetadata => ({
  sourceExam: '',
  year: new Date().getFullYear(),
  sessionKey: '',
  paperKey: '',
  questionNumber: 1,
  sourceNote: '',
});

const emptyDraft = (): QuestionDraft => ({
  type: 'SINGLE_CORRECT_MCQ',
  sourceType: 'CURATED',
  stem: '',
  explanation: '',
  difficulty: 'MEDIUM',
  tagsText: '',
  displayOrder: 0,
  isPublished: false,
  isActive: true,
  isFree: true,
  importKey: '',
  mediaAssetId: null,
  solutionVideoId: null,
  options: blankOptions(),
  pyqMetadata: blankPyq(),
});

function draftFromQuestion(question: QuestionItem): QuestionDraft {
  return {
    ...emptyDraft(),
    ...question,
    type: 'SINGLE_CORRECT_MCQ',
    tagsText: question.tags.join(', '),
    importKey: question.importKey ?? '',
    mediaAssetId: question.mediaAssetId ?? null,
    solutionVideoId: question.solutionVideoId ?? null,
    options: [...question.options].sort((left, right) => left.position - right.position),
    pyqMetadata: question.pyqMetadata
      ? { ...question.pyqMetadata, sourceNote: question.pyqMetadata.sourceNote ?? '' }
      : blankPyq(),
  };
}

export function QuestionForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing?: QuestionItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<QuestionDraft>(() =>
    editing ? draftFromQuestion(editing) : emptyDraft(),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateOption = (index: number, patch: Partial<QuestionOption>) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option,
      ),
    }));
  };

  const chooseCorrectOption = (index: number) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => ({
        ...option,
        isCorrect: optionIndex === index,
      })),
    }));
  };

  const updatePyq = (patch: Partial<QuestionPyqMetadata>) => {
    setForm((current) => ({
      ...current,
      pyqMetadata: { ...current.pyqMetadata, ...patch },
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const options = form.options.map(({ position, text, isCorrect }) => ({
      position,
      text: text.trim(),
      isCorrect,
    }));
    if (options.length !== 4 || options.some((option) => !option.text) || options.filter((option) => option.isCorrect).length !== 1) {
      setError('Provide text for all four options and select exactly one correct answer.');
      return;
    }
    if (form.sourceType === 'PYQ') {
      const pyq = form.pyqMetadata;
      if (!pyq.sourceExam.trim() || !pyq.sessionKey.trim() || !pyq.paperKey.trim() || pyq.questionNumber < 1) {
        setError('Complete all required PYQ source fields.');
        return;
      }
    }

    setSaving(true);
    try {
      await adminMutation(
        `/admin/questions${editing ? `/${editing.id}` : ''}`,
        editing ? 'PATCH' : 'POST',
        {
          type: form.type,
          sourceType: form.sourceType,
          stem: form.stem.trim(),
          explanation: form.explanation.trim(),
          difficulty: form.difficulty,
          tags: form.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
          displayOrder: form.displayOrder === '' ? 0 : Number(form.displayOrder),
          isPublished: form.isPublished,
          isActive: form.isActive,
          isFree: form.isFree,
          importKey: form.sourceType === 'CURATED' ? form.importKey.trim() || null : undefined,
          examId: form.examId,
          subjectId: form.subjectId,
          academicClassId: form.academicClassId,
          chapterId: form.chapterId,
          topicId: form.topicId,
          subtopicId: form.subtopicId || null,
          mediaAssetId: form.mediaAssetId,
          solutionVideoId: form.solutionVideoId?.trim() || null,
          options,
          ...(form.sourceType === 'PYQ'
            ? {
                pyqMetadata: {
                  ...form.pyqMetadata,
                  sourceExam: form.pyqMetadata.sourceExam.trim(),
                  sessionKey: form.pyqMetadata.sessionKey.trim(),
                  paperKey: form.pyqMetadata.paperKey.trim(),
                  sourceNote: form.pyqMetadata.sourceNote?.trim() || undefined,
                },
              }
            : {}),
        },
      );
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save question.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>{editing ? 'Edit' : 'Create'} question</h2>
      {error && <p>{error}</p>}
      <div className="row">
        <label>
          Type
          <select value={form.type} disabled><option>SINGLE_CORRECT_MCQ</option></select>
        </label>
        <label>
          Source
          <select value={form.sourceType} onChange={(event) => update('sourceType', event.target.value as QuestionSourceType)}>
            <option value="CURATED">CURATED</option>
            <option value="PYQ">PYQ</option>
          </select>
        </label>
        <label>
          Difficulty
          <select value={form.difficulty} onChange={(event) => update('difficulty', event.target.value as QuestionDifficulty)}>
            <option value="EASY">EASY</option><option value="MEDIUM">MEDIUM</option><option value="HARD">HARD</option>
          </select>
        </label>
        <HierarchySelector value={form} onChange={(next) => setForm((current) => ({ ...current, ...next }))} />
      </div>
      <textarea required placeholder="Question stem" value={form.stem} onChange={(event) => update('stem', event.target.value)} />
      <textarea required placeholder="Detailed explanation" value={form.explanation} onChange={(event) => update('explanation', event.target.value)} />
      <input placeholder="Tags, separated by commas" value={form.tagsText} onChange={(event) => update('tagsText', event.target.value)} />

      <h3>Options</h3>
      {form.options.map((option, index) => (
        <div className="row" key={option.position}>
          <label>
            <input type="radio" name="correctOption" checked={option.isCorrect} onChange={() => chooseCorrectOption(index)} /> Correct
          </label>
          <span>{option.position}.</span>
          <input required placeholder={`Option ${option.position}`} value={option.text} onChange={(event) => updateOption(index, { text: event.target.value })} />
        </div>
      ))}

      {form.sourceType === 'CURATED' ? (
        <input placeholder="Import key (optional)" value={form.importKey} onChange={(event) => update('importKey', event.target.value)} />
      ) : (
        <fieldset>
          <legend>PYQ source</legend>
          <div className="row">
            <input required placeholder="Source exam" value={form.pyqMetadata.sourceExam} onChange={(event) => updatePyq({ sourceExam: event.target.value })} />
            <input required type="number" min="1900" max="2100" value={form.pyqMetadata.year} onChange={(event) => updatePyq({ year: Number(event.target.value) })} />
            <input required placeholder="Session key" value={form.pyqMetadata.sessionKey} onChange={(event) => updatePyq({ sessionKey: event.target.value })} />
            <input required placeholder="Paper key" value={form.pyqMetadata.paperKey} onChange={(event) => updatePyq({ paperKey: event.target.value })} />
            <input required type="number" min="1" placeholder="Question number" value={form.pyqMetadata.questionNumber} onChange={(event) => updatePyq({ questionNumber: Number(event.target.value) })} />
          </div>
          <textarea placeholder="Source note (optional)" value={form.pyqMetadata.sourceNote ?? ''} onChange={(event) => updatePyq({ sourceNote: event.target.value })} />
        </fieldset>
      )}

      <div className="row">
        <MediaAssetSelector value={form.mediaAssetId} onChange={(value) => update('mediaAssetId', value)} />
        <label>Solution video ID (optional)<input value={form.solutionVideoId ?? ''} onChange={(event) => update('solutionVideoId', event.target.value || null)} /></label>
        <input type="number" min="0" placeholder="Display order" value={form.displayOrder} onChange={(event) => update('displayOrder', event.target.value === '' ? '' : Number(event.target.value))} />
        <label><input type="checkbox" checked={form.isPublished} onChange={(event) => update('isPublished', event.target.checked)} /> Published</label>
        <label><input type="checkbox" checked={form.isActive} onChange={(event) => update('isActive', event.target.checked)} /> Active</label>
        <label><input type="checkbox" checked={form.isFree} onChange={(event) => update('isFree', event.target.checked)} /> Free</label>
      </div>
      <button disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>{' '}
      <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
    </form>
  );
}
