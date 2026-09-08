import type { PaginationMeta } from '../../lib/api';

export type AcademicOption = { id: string; name: string };

export type HierarchyValue = {
  examId?: string;
  subjectId?: string;
  academicClassId?: string;
  chapterId?: string;
  topicId?: string;
  subtopicId?: string;
};

export type ContentStatus = {
  isPublished: boolean;
  isActive: boolean;
};

export type VideoItem = HierarchyValue &
  ContentStatus & {
    id: string;
    title: string;
    slug: string;
    description?: string | null;
    instructorName?: string | null;
    provider: string;
    providerAssetId: string;
    playbackId?: string | null;
    mediaAssetId?: string | null;
    durationSeconds?: number | null;
    displayOrder: number;
    isFree: boolean;
  };

export type RevisionItem = HierarchyValue &
  ContentStatus & {
    id: string;
    title: string;
    type: RevisionType;
    content: string;
    displayOrder: number;
  };

export type FlashcardItem = HierarchyValue &
  ContentStatus & {
    id: string;
    title?: string | null;
    frontContent: string;
    backContent: string;
    explanation?: string | null;
    mediaAssetId?: string | null;
    sortOrder: number;
    isPremium: boolean;
  };

export type RevisionType =
  | 'FORMULA'
  | 'REACTION'
  | 'BIOLOGY_FACT'
  | 'NCERT_HIGHLIGHT'
  | 'SHORT_NOTE';

export type MediaAsset = {
  id: string;
  provider: string;
  externalKey: string;
  url?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  metadata?: Record<string, unknown> | null;
  isActive: boolean;
};

export type ContentImportTarget =
  | 'ACADEMIC_EXAM'
  | 'ACADEMIC_SUBJECT'
  | 'ACADEMIC_CLASS'
  | 'ACADEMIC_CHAPTER'
  | 'ACADEMIC_TOPIC'
  | 'ACADEMIC_SUBTOPIC'
  | 'VIDEO'
  | 'REVISION_ITEM'
  | 'FLASHCARD';

export type ContentImportDuplicateStrategy = 'ERROR' | 'SKIP' | 'UPDATE';
export type ContentImportStatus = 'PREVIEWED' | 'APPLYING' | 'APPLIED' | 'FAILED';
export type ContentImportRowStatus = 'VALID' | 'INVALID' | 'APPLIED' | 'SKIPPED' | 'FAILED';

export type ContentImportSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
};

export type ContentImportJob = ContentImportSummary & {
  id: string;
  target: ContentImportTarget;
  status: ContentImportStatus;
  originalFilename: string;
  checksum: string;
  duplicateStrategy: ContentImportDuplicateStrategy;
  previewedAt: string;
  appliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentImportRow = {
  id: string;
  jobId: string;
  rowNumber: number;
  normalizedData: Record<string, unknown>;
  status: ContentImportRowStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultingEntityId?: string | null;
};

export type ContentImportPreview = {
  jobId: string;
  status: ContentImportStatus;
  summary: ContentImportSummary;
  rows: ContentImportRow[];
};

export type ContentFilters = {
  search: string;
  page: number;
  limit: number;
  examId?: string;
  subjectId?: string;
  classId?: string;
  chapterId?: string;
  topicId?: string;
  subtopicId?: string;
  isPublished?: boolean;
  isActive?: boolean;
  isPremium?: boolean;
  type?: RevisionType;
  provider?: string;
};

export const defaultContentFilters: ContentFilters = {
  search: '',
  page: 1,
  limit: 20,
};

export type ListState<T> = {
  items: T[];
  meta: PaginationMeta;
};
