'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';

import {
  adminApi,
  adminGet,
  ApiError,
  type PaginatedResponse,
} from '../../lib/api';
import { PaginationControls } from '../learning/PaginationControls';
import type {
  ContentImportDuplicateStrategy,
  ContentImportJob,
  ContentImportPreview,
  ContentImportRow,
  ContentImportTarget,
} from '../learning/cms-types';

const maxFileSizeBytes = 5 * 1024 * 1024;
const pageLimit = 20;

type TargetConfig = {
  value: ContentImportTarget;
  label: string;
  requiredColumns: string[];
  optionalColumns: string[];
  naturalKey: string;
  errorOnlyDuplicateStrategy?: boolean;
};

const targetConfigs: TargetConfig[] = [
  {
    value: 'ACADEMIC_EXAM',
    label: 'Exam',
    requiredColumns: ['name', 'slug'],
    optionalColumns: ['display_order', 'is_active', 'is_published'],
    naturalKey: 'slug',
  },
  {
    value: 'ACADEMIC_SUBJECT',
    label: 'Subject',
    requiredColumns: ['name', 'slug', 'exam_slug'],
    optionalColumns: ['display_order', 'is_active', 'is_published'],
    naturalKey: 'exam_slug + slug',
  },
  {
    value: 'ACADEMIC_CLASS',
    label: 'Academic Class',
    requiredColumns: ['name', 'slug', 'exam_slug', 'subject_slug'],
    optionalColumns: ['display_order', 'is_active', 'is_published'],
    naturalKey: 'exam_slug + subject_slug + slug',
  },
  {
    value: 'ACADEMIC_CHAPTER',
    label: 'Chapter',
    requiredColumns: [
      'name',
      'slug',
      'exam_slug',
      'subject_slug',
      'class_slug',
    ],
    optionalColumns: ['display_order', 'is_active', 'is_published'],
    naturalKey: 'exam_slug + subject_slug + class_slug + slug',
  },
  {
    value: 'ACADEMIC_TOPIC',
    label: 'Topic',
    requiredColumns: [
      'name',
      'slug',
      'exam_slug',
      'subject_slug',
      'class_slug',
      'chapter_slug',
    ],
    optionalColumns: ['display_order', 'is_active', 'is_published'],
    naturalKey: 'exam_slug + subject_slug + class_slug + chapter_slug + slug',
  },
  {
    value: 'ACADEMIC_SUBTOPIC',
    label: 'Subtopic',
    requiredColumns: [
      'name',
      'slug',
      'exam_slug',
      'subject_slug',
      'class_slug',
      'chapter_slug',
      'topic_slug',
    ],
    optionalColumns: ['display_order', 'is_active', 'is_published'],
    naturalKey:
      'exam_slug + subject_slug + class_slug + chapter_slug + topic_slug + slug',
  },
  {
    value: 'VIDEO',
    label: 'Video',
    requiredColumns: [
      'title',
      'slug',
      'provider_asset_id',
      'exam_slug',
      'subject_slug',
      'class_slug',
      'chapter_slug',
      'topic_slug',
    ],
    optionalColumns: [
      'description',
      'instructor_name',
      'thumbnail_url',
      'provider',
      'playback_id',
      'duration_seconds',
      'display_order',
      'is_free',
      'is_active',
      'is_published',
      'subtopic_slug',
      'media_provider',
      'media_external_key',
    ],
    naturalKey: 'slug',
  },
  {
    value: 'REVISION_ITEM',
    label: 'Revision Item',
    requiredColumns: [
      'title',
      'type',
      'content',
      'exam_slug',
      'subject_slug',
      'class_slug',
      'chapter_slug',
      'topic_slug',
    ],
    optionalColumns: [
      'display_order',
      'is_active',
      'is_published',
      'subtopic_slug',
    ],
    naturalKey: 'No deterministic import update key; ERROR only.',
    errorOnlyDuplicateStrategy: true,
  },
  {
    value: 'FLASHCARD',
    label: 'Flashcard',
    requiredColumns: [
      'front_content',
      'back_content',
      'exam_slug',
      'subject_slug',
      'class_slug',
      'chapter_slug',
      'topic_slug',
    ],
    optionalColumns: [
      'title',
      'explanation',
      'image_url',
      'sort_order',
      'is_active',
      'is_published',
      'is_premium',
      'subtopic_slug',
      'media_provider',
      'media_external_key',
    ],
    naturalKey: 'No deterministic import update key; ERROR only.',
    errorOnlyDuplicateStrategy: true,
  },
  {
    value: 'QUESTION',
    label: 'Question / PYQ',
    requiredColumns: [
      'source_type',
      'question_text',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_option',
      'explanation',
      'difficulty',
      'exam_slug',
      'subject_slug',
      'class_slug',
      'chapter_slug',
      'topic_slug',
    ],
    optionalColumns: [
      'subtopic_slug',
      'tags',
      'display_order',
      'is_active',
      'is_published',
      'is_free',
      'solution_video_slug',
      'media_provider',
      'media_external_key',
      'import_key (CURATED)',
      'source_exam (PYQ)',
      'pyq_year (PYQ)',
      'pyq_session (PYQ)',
      'pyq_paper (PYQ)',
      'question_number (PYQ)',
      'source_note (PYQ)',
    ],
    naturalKey: 'CURATED: import_key. PYQ: source_exam + pyq_year + pyq_session + pyq_paper + question_number.',
  },
];

const strategyOptions: Array<{
  value: ContentImportDuplicateStrategy;
  label: string;
}> = [
  { value: 'ERROR', label: 'Error on duplicate' },
  { value: 'SKIP', label: 'Skip duplicates' },
  { value: 'UPDATE', label: 'Update duplicates' },
];

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function describeRowData(data: Record<string, unknown>): string {
  const entries = Object.entries(data).slice(0, 5);
  if (entries.length === 0) {
    return '—';
  }

  const summary = entries
    .map(([key, value]) => `${key}: ${String(value ?? '')}`)
    .join(' · ');
  return Object.keys(data).length > entries.length ? `${summary} …` : summary;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.code ? `${error.code}: ${error.message}` : error.message;
  }

  return 'The request could not be completed. Please try again.';
}

export default function ContentImportsPage() {
  const [target, setTarget] = useState<ContentImportTarget>('ACADEMIC_EXAM');
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<ContentImportDuplicateStrategy>('ERROR');
  const [file, setFile] = useState<File | null>(null);
  const [selectedJob, setSelectedJob] = useState<ContentImportJob | null>(null);
  const [preview, setPreview] = useState<ContentImportPreview | null>(null);
  const [rows, setRows] = useState<PaginatedResponse<ContentImportRow> | null>(
    null,
  );
  const [history, setHistory] = useState<PaginatedResponse<ContentImportJob> | null>(
    null,
  );
  const [rowPage, setRowPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const targetConfig = useMemo(
    () => targetConfigs.find((config) => config.value === target) ?? targetConfigs[0],
    [target],
  );

  const clearCurrentPreview = () => {
    setSelectedJob(null);
    setPreview(null);
    setRows(null);
    setRowPage(1);
    setActionMessage(null);
  };

  const loadHistory = async (page = historyPage) => {
    setLoadingHistory(true);
    try {
      const response = await adminGet<PaginatedResponse<ContentImportJob>>(
        '/admin/content-imports',
        { page, limit: pageLimit },
      );
      setHistory(response);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadRows = async (jobId: string, page = 1) => {
    setLoadingRows(true);
    try {
      const response = await adminGet<PaginatedResponse<ContentImportRow>>(
        `/admin/content-imports/${jobId}/rows`,
        { page, limit: pageLimit },
      );
      setRows(response);
      setRowPage(page);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setLoadingRows(false);
    }
  };

  const openJob = async (jobId: string) => {
    setLoadingJob(true);
    setFormError(null);
    setActionMessage(null);
    try {
      const job = await adminGet<ContentImportJob>(
        `/admin/content-imports/${jobId}`,
      );
      setSelectedJob(job);
      setPreview(null);
      await loadRows(job.id, 1);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setLoadingJob(false);
    }
  };

  useEffect(() => {
    void loadHistory(historyPage);
    // The page change is the intentional refresh trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPage]);

  const handleTargetChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTarget = event.target.value as ContentImportTarget;
    const nextConfig = targetConfigs.find((config) => config.value === nextTarget);

    setTarget(nextTarget);
    clearCurrentPreview();
    setFormError(null);

    if (nextConfig?.errorOnlyDuplicateStrategy && duplicateStrategy !== 'ERROR') {
      setDuplicateStrategy('ERROR');
      setActionMessage(
        'Revision Item and Flashcard imports support ERROR duplicate handling only. The strategy was reset to Error on duplicate.',
      );
    }
  };

  const handleStrategyChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDuplicateStrategy(event.target.value as ContentImportDuplicateStrategy);
    clearCurrentPreview();
    setFormError(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    clearCurrentPreview();
    setFormError(null);

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const extension = selectedFile.name.split('.').pop()?.toLowerCase();
    if (extension !== 'csv' && extension !== 'xlsx') {
      setFile(null);
      setFormError('Choose a CSV or XLSX file.');
      event.target.value = '';
      return;
    }

    if (selectedFile.size > maxFileSizeBytes) {
      setFile(null);
      setFormError('The selected file exceeds the 5 MB limit.');
      event.target.value = '';
      return;
    }

    setFile(selectedFile);
  };

  const handlePreview = async () => {
    if (!file) {
      setFormError('Choose a CSV or XLSX file before previewing.');
      return;
    }

    setPreviewing(true);
    setFormError(null);
    setActionMessage(null);
    try {
      const formData = new FormData();
      formData.append('target', target);
      formData.append('duplicateStrategy', duplicateStrategy);
      formData.append('file', file);

      const result = await adminApi<ContentImportPreview>(
        '/admin/content-imports/preview',
        { method: 'POST', body: formData },
      );
      setPreview(result);
      await openJob(result.jobId);
      await loadHistory(1);
      setHistoryPage(1);
      setActionMessage(
        'Preview completed. No academic or learning content has been changed.',
      );
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!selectedJob) {
      return;
    }

    const confirmed = window.confirm(
      'Apply this import? This will create or update CMS content according to the selected duplicate strategy.',
    );
    if (!confirmed) {
      return;
    }

    setApplying(true);
    setFormError(null);
    setActionMessage(null);
    try {
      await adminApi(`/admin/content-imports/${selectedJob.id}/apply`, {
        method: 'POST',
      });
      await openJob(selectedJob.id);
      await loadHistory(1);
      setHistoryPage(1);
      setActionMessage('Import applied successfully.');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setApplying(false);
    }
  };

  const selectedSummary = selectedJob
    ? selectedJob
    : preview
      ? preview.summary
      : null;
  const canApply =
    selectedJob?.status === 'PREVIEWED' &&
    selectedJob.invalidRows === 0 &&
    !applying;

  return (
    <main>
      <h1>Bulk content import</h1>
      <p>
        Preview validates a CSV or XLSX file and saves an auditable import job.
        It does not change CMS content until you explicitly apply the job.
      </p>

      <section>
        <h2>Create preview</h2>
        <label>
          Import target
          <select value={target} onChange={handleTargetChange} disabled={previewing}>
            {targetConfigs.map((config) => (
              <option key={config.value} value={config.value}>
                {config.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Duplicate strategy
          <select
            value={duplicateStrategy}
            onChange={handleStrategyChange}
            disabled={previewing || targetConfig.errorOnlyDuplicateStrategy}
          >
            {strategyOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={targetConfig.errorOnlyDuplicateStrategy && option.value !== 'ERROR'}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {targetConfig.errorOnlyDuplicateStrategy ? (
          <p>
            Revision Item and Flashcard imports currently support Error on
            duplicate only because they do not have a deterministic update key.
          </p>
        ) : null}

        <label>
          CSV or XLSX file
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileChange}
            disabled={previewing}
          />
        </label>
        <p>
          {file ? `Selected: ${file.name}` : 'No file selected.'} Maximum 5 MB
          and 500 data rows.
        </p>
        <button type="button" onClick={() => void handlePreview()} disabled={previewing || !file}>
          {previewing ? 'Previewing…' : 'Preview import'}
        </button>
      </section>

      <section>
        <h2>Format guidance: {targetConfig.label}</h2>
        <p>
          Use headers exactly as shown. Hierarchy references use readable scoped
          slug paths, never internal database IDs.
        </p>
        <p>
          <strong>Required:</strong> {targetConfig.requiredColumns.join(', ')}
        </p>
        <p>
          <strong>Optional:</strong>{' '}
          {targetConfig.optionalColumns.length > 0
            ? targetConfig.optionalColumns.join(', ')
            : 'None'}
        </p>
        <p>
          <strong>Natural key:</strong> {targetConfig.naturalKey}
        </p>
        {target === 'QUESTION' ? (
          <p>
            Use <strong>CURATED</strong> or <strong>PYQ</strong> for source_type.
            correct_option accepts A, B, C, D, 1, 2, 3, or 4. CURATED SKIP/UPDATE
            requires import_key; PYQ identity requires every PYQ-specific field.
          </p>
        ) : null}
      </section>

      {formError ? <p role="alert">{formError}</p> : null}
      {actionMessage ? <p role="status">{actionMessage}</p> : null}

      <section>
        <h2>Selected import</h2>
        {loadingJob ? <p>Loading import job…</p> : null}
        {!selectedJob && !loadingJob ? (
          <p>Preview a file or open a job from the import history.</p>
        ) : null}
        {selectedJob && selectedSummary ? (
          <>
            <p>
              <strong>{selectedJob.originalFilename}</strong> · {selectedJob.target}{' '}
              · {selectedJob.status}
            </p>
            <p>Job ID: {selectedJob.id}</p>
            <dl>
              <dt>Total rows</dt>
              <dd>{selectedSummary.totalRows}</dd>
              <dt>Valid rows</dt>
              <dd>{selectedSummary.validRows}</dd>
              <dt>Invalid rows</dt>
              <dd>{selectedSummary.invalidRows}</dd>
              <dt>Inserted rows</dt>
              <dd>{selectedSummary.insertedRows}</dd>
              <dt>Updated rows</dt>
              <dd>{selectedSummary.updatedRows}</dd>
              <dt>Skipped rows</dt>
              <dd>{selectedSummary.skippedRows}</dd>
              <dt>Failed rows</dt>
              <dd>{selectedSummary.failedRows}</dd>
            </dl>
            {selectedJob.status === 'PREVIEWED' && selectedJob.invalidRows > 0 ? (
              <p>Resolve the invalid rows in a new import file before applying.</p>
            ) : null}
            <button type="button" onClick={() => void handleApply()} disabled={!canApply}>
              {applying ? 'Applying…' : 'Apply import'}
            </button>
            {!canApply && selectedJob.status === 'PREVIEWED' && selectedJob.invalidRows > 0 ? (
              <p>Apply is unavailable while preview validation contains errors.</p>
            ) : null}
          </>
        ) : null}
      </section>

      {selectedJob ? (
        <section>
          <h2>Row results</h2>
          {loadingRows ? <p>Loading rows…</p> : null}
          {!loadingRows && rows?.items.length === 0 ? <p>No persisted rows found.</p> : null}
          {!loadingRows && rows && rows.items.length > 0 ? (
            <>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Status</th>
                    <th scope="col">Data</th>
                    <th scope="col">Error code</th>
                    <th scope="col">Error message</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.rowNumber}</td>
                      <td>{row.status}</td>
                      <td>{describeRowData(row.normalizedData)}</td>
                      <td>{row.errorCode ?? '—'}</td>
                      <td>{row.errorMessage ?? '—'}</td>
                      <td>{row.resultingEntityId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationControls
                meta={rows.meta}
                onPageChange={(page) => void loadRows(selectedJob.id, page)}
              />
            </>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2>Import history</h2>
        {loadingHistory ? <p>Loading import history…</p> : null}
        {!loadingHistory && history?.items.length === 0 ? <p>No import jobs yet.</p> : null}
        {!loadingHistory && history && history.items.length > 0 ? (
          <>
            <table>
              <thead>
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">Filename</th>
                  <th scope="col">Target</th>
                  <th scope="col">Strategy</th>
                  <th scope="col">Status</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Applied</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((job) => (
                  <tr key={job.id}>
                    <td>{formatDate(job.createdAt)}</td>
                    <td>{job.originalFilename}</td>
                    <td>{job.target}</td>
                    <td>{job.duplicateStrategy}</td>
                    <td>{job.status}</td>
                    <td>
                      {job.validRows}/{job.totalRows} valid
                    </td>
                    <td>{formatDate(job.appliedAt)}</td>
                    <td>
                      <button type="button" onClick={() => void openJob(job.id)}>
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls
              meta={history.meta}
              onPageChange={setHistoryPage}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
