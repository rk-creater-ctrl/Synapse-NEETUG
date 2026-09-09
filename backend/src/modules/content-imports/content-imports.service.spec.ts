import {
  ContentImportDuplicateStrategy,
  ContentImportRowStatus,
  ContentImportStatus,
  ContentImportTarget,
} from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ContentImportsService } from './content-imports.service';

const validExamRow = {
  id: 'row-1',
  rowNumber: 2,
  normalizedData: { name: 'NEET UG', slug: 'neet-ug' },
  status: ContentImportRowStatus.VALID,
};

function previewedExamJob(
  strategy: ContentImportDuplicateStrategy = ContentImportDuplicateStrategy.ERROR,
) {
  return {
    id: 'job-1',
    target: ContentImportTarget.ACADEMIC_EXAM,
    status: ContentImportStatus.APPLYING,
    duplicateStrategy: strategy,
    invalidRows: 0,
    totalRows: 1,
    validRows: 1,
    insertedRows: 0,
    updatedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    rows: [validExamRow],
  };
}

function createDb() {
  return {
    $transaction: jest.fn(),
    exam: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    subject: { findUnique: jest.fn() },
    academicClass: { findUnique: jest.fn() },
    chapter: { findUnique: jest.fn() },
    topic: { findUnique: jest.fn() },
    subtopic: { findUnique: jest.fn() },
    video: { findUnique: jest.fn() },
    mediaAsset: { findUnique: jest.fn() },
    question: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    questionPyqMetadata: { findUnique: jest.fn() },
    contentImportJob: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    contentImportRow: { update: jest.fn() },
    contentAuditEvent: { create: jest.fn() },
  };
}

describe('ContentImportsService preview', () => {
  it('rejects missing target headers before creating an import job', async () => {
    const db = createDb();
    const service = new ContentImportsService(db as never);

    await expect(service.preview('actor-from-jwt', {
      target: ContentImportTarget.ACADEMIC_EXAM,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'exams.csv', size: 15, buffer: Buffer.from('title\nNEET UG'),
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IMPORT_INVALID_HEADERS' }),
    });
    expect(db.contentImportJob.create).not.toHaveBeenCalled();
  });

  it('persists only preview metadata and rows for a valid academic import', async () => {
    const db = createDb();
    db.exam.findUnique.mockResolvedValue(null);
    db.contentImportJob.create.mockImplementation(async ({ data }: { data: { rows: { create: unknown[] } } }) => ({
      id: 'job-1',
      status: ContentImportStatus.PREVIEWED,
      ...data,
      rows: data.rows.create,
    }));
    const service = new ContentImportsService(db as never);

    await service.preview('actor-from-jwt', {
      target: ContentImportTarget.ACADEMIC_EXAM,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'exams.csv', size: 24, buffer: Buffer.from('name,slug\nNEET,neet'),
    });

    expect(db.contentImportJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdByUserId: 'actor-from-jwt', totalRows: 1, validRows: 1 }),
    }));
    expect(db.exam.findUnique).toHaveBeenCalled();
  });

  it('reports duplicate natural keys within a file without mutating academic content', async () => {
    const db = createDb();
    db.exam.findUnique.mockResolvedValue(null);
    db.contentImportJob.create.mockImplementation(async ({ data }: { data: { rows: { create: unknown[] } } }) => ({
      id: 'job-duplicates', status: ContentImportStatus.PREVIEWED, ...data, rows: data.rows.create,
    }));
    const service = new ContentImportsService(db as never);

    const preview = await service.preview('actor-from-jwt', {
      target: ContentImportTarget.ACADEMIC_EXAM,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'exams.csv',
      size: 37,
      buffer: Buffer.from('name,slug\nNEET,neet\nNEET copy,neet'),
    });

    expect(preview.summary).toEqual(expect.objectContaining({ validRows: 1, invalidRows: 1 }));
    expect(preview.rows[1]).toEqual(expect.objectContaining({
      status: ContentImportRowStatus.INVALID,
      errorCode: 'IMPORT_DUPLICATE',
    }));
    expect(db.exam.create).not.toHaveBeenCalled();
  });

  it('persists field validation failures as row-level preview errors', async () => {
    const db = createDb();
    db.exam.findUnique.mockResolvedValue(null);
    db.contentImportJob.create.mockImplementation(async ({ data }: { data: { rows: { create: unknown[] } } }) => ({
      id: 'job-invalid-row', status: ContentImportStatus.PREVIEWED, ...data, rows: data.rows.create,
    }));
    const service = new ContentImportsService(db as never);

    const preview = await service.preview('actor-from-jwt', {
      target: ContentImportTarget.ACADEMIC_EXAM,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'exams.csv', size: 18, buffer: Buffer.from('name,slug\nNEET UG,'),
    });

    expect(preview.rows[0]).toEqual(expect.objectContaining({
      status: ContentImportRowStatus.INVALID,
      errorCode: 'IMPORT_ROW_INVALID',
    }));
  });

  it('honors ERROR against database duplicates and allows deterministic UPDATE preview', async () => {
    const db = createDb();
    db.exam.findUnique.mockResolvedValue({ id: 'exam-existing' });
    db.contentImportJob.create.mockImplementation(async ({ data }: { data: { rows: { create: unknown[] } } }) => ({
      id: 'job-existing', status: ContentImportStatus.PREVIEWED, ...data, rows: data.rows.create,
    }));
    const service = new ContentImportsService(db as never);
    const file = {
      originalname: 'exams.csv', size: 24, buffer: Buffer.from('name,slug\nNEET,neet'),
    };

    const errorPreview = await service.preview('actor', {
      target: ContentImportTarget.ACADEMIC_EXAM,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, file);
    const updatePreview = await service.preview('actor', {
      target: ContentImportTarget.ACADEMIC_EXAM,
      duplicateStrategy: ContentImportDuplicateStrategy.UPDATE,
    }, file);

    expect(errorPreview.rows[0]).toEqual(expect.objectContaining({ status: ContentImportRowStatus.INVALID }));
    expect(updatePreview.rows[0]).toEqual(expect.objectContaining({ status: ContentImportRowStatus.VALID }));
  });

  it('rejects SKIP and UPDATE for targets without a deterministic update key', async () => {
    const db = createDb();
    const service = new ContentImportsService(db as never);

    await expect(service.preview('actor', {
      target: ContentImportTarget.REVISION_ITEM,
      duplicateStrategy: ContentImportDuplicateStrategy.SKIP,
    }, {
      originalname: 'revision.csv',
      size: 164,
      buffer: Buffer.from(
        'title,type,content,exam_slug,subject_slug,class_slug,chapter_slug,topic_slug\nRevision,FORMULA,Formula content,neet,physics,class-11,units,physical-quantities',
      ),
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IMPORT_INVALID_HEADERS' }),
    });
  });

  it('resolves video hierarchy by scoped slugs and marks missing hierarchy rows invalid', async () => {
    const db = createDb();
    db.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    db.subject.findUnique.mockResolvedValue({ id: 'subject-1' });
    db.academicClass.findUnique.mockResolvedValue({ id: 'class-1' });
    db.chapter.findUnique.mockResolvedValue({ id: 'chapter-1' });
    db.topic.findUnique.mockResolvedValue({ id: 'topic-1' });
    db.video.findUnique.mockResolvedValue(null);
    db.contentImportJob.create.mockImplementation(async ({ data }: { data: { rows: { create: unknown[] } } }) => ({
      id: 'job-video', status: ContentImportStatus.PREVIEWED, ...data, rows: data.rows.create,
    }));
    const service = new ContentImportsService(db as never);

    const preview = await service.preview('actor', {
      target: ContentImportTarget.VIDEO,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'videos.csv',
      size: 158,
      buffer: Buffer.from('title,slug,provider_asset_id,exam_slug,subject_slug,class_slug,chapter_slug,topic_slug\nUnits,units,asset-1,neet,physics,class-11,units,physical-quantities'),
    });

    expect(preview.rows[0]).toEqual(expect.objectContaining({ status: ContentImportRowStatus.VALID }));
    expect(db.subject.findUnique).toHaveBeenCalledWith({
      where: { examId_slug: { examId: 'exam-1', slug: 'physics' } },
    });

    db.exam.findUnique.mockResolvedValueOnce(null);
    const missingParent = await service.preview('actor', {
      target: ContentImportTarget.VIDEO,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'videos.csv',
      size: 158,
      buffer: Buffer.from('title,slug,provider_asset_id,exam_slug,subject_slug,class_slug,chapter_slug,topic_slug\nUnits,units,asset-1,missing,physics,class-11,units,physical-quantities'),
    });
    expect(missingParent.rows[0]).toEqual(expect.objectContaining({
      status: ContentImportRowStatus.INVALID,
      errorCode: 'IMPORT_ROW_INVALID',
    }));
  });
});

describe('ContentImportsService Question imports', () => {
  const questionHeaders = [
    'source_type', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d',
    'correct_option', 'explanation', 'difficulty', 'exam_slug', 'subject_slug',
    'class_slug', 'chapter_slug', 'topic_slug',
  ].join(',');
  const curatedRow = [
    'CURATED', 'What is an SI unit?', 'Metre', 'Second', 'Kelvin', 'Mole', 'A',
    'Metre is the SI unit of length.', 'EASY', 'neet', 'physics', 'class-11',
    'units', 'physical-quantities',
  ].join(',');

  const prepareHierarchy = (db: ReturnType<typeof createDb>) => {
    db.exam.findUnique.mockResolvedValue({ id: 'exam-1' });
    db.subject.findUnique.mockResolvedValue({ id: 'subject-1' });
    db.academicClass.findUnique.mockResolvedValue({ id: 'class-1' });
    db.chapter.findUnique.mockResolvedValue({ id: 'chapter-1' });
    db.topic.findUnique.mockResolvedValue({ id: 'topic-1' });
  };

  const persistPreview = (db: ReturnType<typeof createDb>) => {
    db.contentImportJob.create.mockImplementation(async ({ data }: { data: { rows: { create: unknown[] } } }) => ({
      id: 'question-job', status: ContentImportStatus.PREVIEWED, ...data, rows: data.rows.create,
    }));
  };

  it('previews a valid curated Question without creating Question records', async () => {
    const db = createDb();
    prepareHierarchy(db);
    persistPreview(db);
    db.question.findUnique.mockResolvedValue(null);
    const service = new ContentImportsService(db as never);

    const preview = await service.preview('actor-from-jwt', {
      target: ContentImportTarget.QUESTION,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'questions.csv', size: 512, buffer: Buffer.from(`${questionHeaders},import_key\n${curatedRow},physics-si-unit-001`),
    });

    expect(preview.summary).toEqual(expect.objectContaining({ validRows: 1, invalidRows: 0 }));
    expect(db.question.create).not.toHaveBeenCalled();
  });

  it.each(['A', 'B', 'C', 'D', '1', '2', '3', '4'])('accepts correct_option %s', async (correctOption) => {
    const db = createDb();
    prepareHierarchy(db);
    persistPreview(db);
    db.question.findUnique.mockResolvedValue(null);
    const service = new ContentImportsService(db as never);

    const preview = await service.preview('actor', {
      target: ContentImportTarget.QUESTION,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'questions.csv', size: 512,
      buffer: Buffer.from(`${questionHeaders}\n${curatedRow.replace(',A,', `,${correctOption},`)}`),
    });

    expect(preview.rows[0]).toEqual(expect.objectContaining({ status: ContentImportRowStatus.VALID }));
  });

  it('reports invalid correct_option and missing PYQ identity as preview row errors', async () => {
    const db = createDb();
    prepareHierarchy(db);
    persistPreview(db);
    const service = new ContentImportsService(db as never);

    const invalidOption = await service.preview('actor', {
      target: ContentImportTarget.QUESTION,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'questions.csv', size: 512,
      buffer: Buffer.from(`${questionHeaders}\n${curatedRow.replace(',A,', ',Z,')}`),
    });
    const missingPyqIdentity = await service.preview('actor', {
      target: ContentImportTarget.QUESTION,
      duplicateStrategy: ContentImportDuplicateStrategy.ERROR,
    }, {
      originalname: 'questions.csv', size: 512,
      buffer: Buffer.from(`${questionHeaders}\n${curatedRow.replace('CURATED', 'PYQ')}`),
    });

    expect(invalidOption.rows[0]).toEqual(expect.objectContaining({ errorCode: 'IMPORT_INVALID_CORRECT_OPTION' }));
    expect(missingPyqIdentity.rows[0]).toEqual(expect.objectContaining({ errorCode: 'IMPORT_PYQ_IDENTITY_REQUIRED' }));
  });

  it('requires a curated import_key for SKIP and UPDATE strategies', async () => {
    const db = createDb();
    prepareHierarchy(db);
    persistPreview(db);
    const service = new ContentImportsService(db as never);

    const preview = await service.preview('actor', {
      target: ContentImportTarget.QUESTION,
      duplicateStrategy: ContentImportDuplicateStrategy.UPDATE,
    }, {
      originalname: 'questions.csv', size: 512, buffer: Buffer.from(`${questionHeaders}\n${curatedRow}`),
    });

    expect(preview.rows[0]).toEqual(expect.objectContaining({
      status: ContentImportRowStatus.INVALID,
      errorCode: 'IMPORT_ROW_INVALID',
    }));
  });
});

describe('ContentImportsService apply', () => {
  function setupApply(
    strategy: ContentImportDuplicateStrategy = ContentImportDuplicateStrategy.ERROR,
  ) {
    const db = createDb();
    const tx = createDb();
    const job = previewedExamJob(strategy);
    db.contentImportJob.updateMany.mockResolvedValue({ count: 1 });
    tx.contentImportJob.findUnique.mockResolvedValue(job);
    tx.contentImportJob.update.mockImplementation(async ({ data }: { data: object }) => ({ ...job, ...data }));
    tx.exam.findUnique.mockResolvedValue(null);
    tx.exam.create.mockResolvedValue({ id: 'exam-created', name: 'NEET UG', slug: 'neet-ug' });
    tx.contentImportRow.update.mockResolvedValue({});
    tx.contentAuditEvent.create.mockResolvedValue({ id: 'audit-1' });
    db.$transaction.mockImplementation((callback: (client: unknown) => Promise<unknown>) => callback(tx));
    db.contentImportJob.update.mockResolvedValue({});
    db.contentImportRow.update.mockResolvedValue({});
    return { db, tx, job, service: new ContentImportsService(db as never) };
  }

  it('commits content, row states, audit events, and APPLIED job status in one transaction', async () => {
    const { service, tx } = setupApply();

    const result = await service.apply('job-1', 'actor-from-jwt');

    expect(tx.exam.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ slug: 'neet-ug' }),
    }));
    expect(tx.contentAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorUserId: 'actor-from-jwt', action: 'CREATE', importJobId: 'job-1' }),
    }));
    expect(tx.contentImportRow.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ContentImportRowStatus.APPLIED }),
    }));
    expect(tx.contentImportJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ContentImportStatus.APPLIED, insertedRows: 1 }),
    }));
    expect(result).toEqual(expect.objectContaining({ status: ContentImportStatus.APPLIED }));
  });

  it('records before and after snapshots for deterministic UPDATE imports', async () => {
    const { service, tx } = setupApply(ContentImportDuplicateStrategy.UPDATE);
    tx.exam.findUnique.mockResolvedValue({ id: 'exam-existing', name: 'Old NEET', slug: 'neet-ug' });
    tx.exam.update.mockResolvedValue({ id: 'exam-existing', name: 'NEET UG', slug: 'neet-ug' });

    await service.apply('job-1', 'actor-from-jwt');

    expect(tx.contentAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorUserId: 'actor-from-jwt',
        action: 'UPDATE',
        beforeData: expect.objectContaining({ name: 'Old NEET' }),
        afterData: expect.objectContaining({ name: 'NEET UG' }),
      }),
    }));
  });

  it('skips a deterministic duplicate without creating content or an audit event', async () => {
    const { service, tx } = setupApply(ContentImportDuplicateStrategy.SKIP);
    tx.exam.findUnique.mockResolvedValue({ id: 'exam-existing', name: 'NEET UG', slug: 'neet-ug' });

    const result = await service.apply('job-1', 'actor-from-jwt');

    expect(tx.exam.create).not.toHaveBeenCalled();
    expect(tx.exam.update).not.toHaveBeenCalled();
    expect(tx.contentAuditEvent.create).not.toHaveBeenCalled();
    expect(tx.contentImportRow.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ContentImportRowStatus.SKIPPED }),
    }));
    expect(result.summary).toEqual(expect.objectContaining({ skippedRows: 1 }));
  });

  it('revalidates at apply time and records the failed row without partial commit', async () => {
    const { db, service, tx } = setupApply();
    tx.exam.findUnique.mockResolvedValue({ id: 'exam-created-after-preview' });

    await expect(service.apply('job-1', 'actor-from-jwt')).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.exam.create).not.toHaveBeenCalled();
    expect(tx.contentImportJob.update).not.toHaveBeenCalled();
    expect(db.contentImportJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ContentImportStatus.FAILED, failedRows: 1 }),
    }));
    expect(db.contentImportRow.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ContentImportRowStatus.FAILED, errorCode: 'IMPORT_DUPLICATE' }),
    }));
  });

  it('reserves a job before mutation so already-applied and concurrent requests cannot apply it twice', async () => {
    const db = createDb();
    db.contentImportJob.updateMany.mockResolvedValue({ count: 0 });
    db.contentImportJob.findUnique.mockResolvedValue({ id: 'job-1', status: ContentImportStatus.APPLIED });
    const service = new ContentImportsService(db as never);

    await expect(service.apply('job-1', 'actor')).rejects.toBeInstanceOf(ConflictException);
    expect(db.$transaction).not.toHaveBeenCalled();

    db.contentImportJob.findUnique.mockResolvedValue({ id: 'job-1', status: ContentImportStatus.APPLYING });
    await expect(service.apply('job-1', 'actor')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not convert unexpected transaction errors into row validation responses', async () => {
    const { db, service, tx } = setupApply();
    const databaseFailure = new Error('database unavailable');
    tx.exam.create.mockRejectedValue(databaseFailure);

    await expect(service.apply('job-1', 'actor')).rejects.toBe(databaseFailure);
    expect(db.contentImportJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ContentImportStatus.FAILED, failedRows: 0 }),
    }));
  });
});
