import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContentImportDuplicateStrategy,
  ContentImportRowStatus,
  ContentImportStatus,
  ContentImportTarget,
  Prisma,
  RevisionType,
  VideoProvider,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { parseImportFile, type UploadedImportFile } from './import-file.parser';
import {
  ContentImportListDto,
  PreviewContentImportDto,
} from './content-imports.dto';

type ImportClient = PrismaService | Prisma.TransactionClient;
type RowData = Record<string, string>;
type PreparedRow = { data: Record<string, unknown>; naturalKey: string };
type RowResult = {
  rowNumber: number;
  normalizedData: Prisma.InputJsonValue;
  status: ContentImportRowStatus;
  errorCode?: string;
  errorMessage?: string;
};
type ApplyResult = { entity: Record<string, unknown>; action: 'CREATE' | 'UPDATE' | 'SKIP' };

const REQUIRED_HEADERS: Record<ContentImportTarget, string[]> = {
  ACADEMIC_EXAM: ['name', 'slug'],
  ACADEMIC_SUBJECT: ['name', 'slug', 'exam_slug'],
  ACADEMIC_CLASS: ['name', 'slug', 'exam_slug', 'subject_slug'],
  ACADEMIC_CHAPTER: ['name', 'slug', 'exam_slug', 'subject_slug', 'class_slug'],
  ACADEMIC_TOPIC: ['name', 'slug', 'exam_slug', 'subject_slug', 'class_slug', 'chapter_slug'],
  ACADEMIC_SUBTOPIC: ['name', 'slug', 'exam_slug', 'subject_slug', 'class_slug', 'chapter_slug', 'topic_slug'],
  VIDEO: ['title', 'slug', 'provider_asset_id', 'exam_slug', 'subject_slug', 'class_slug', 'chapter_slug', 'topic_slug'],
  REVISION_ITEM: ['title', 'type', 'content', 'exam_slug', 'subject_slug', 'class_slug', 'chapter_slug', 'topic_slug'],
  FLASHCARD: ['front_content', 'back_content', 'exam_slug', 'subject_slug', 'class_slug', 'chapter_slug', 'topic_slug'],
};

const UPDATE_SUPPORTED = new Set<ContentImportTarget>([
  ContentImportTarget.ACADEMIC_EXAM,
  ContentImportTarget.ACADEMIC_SUBJECT,
  ContentImportTarget.ACADEMIC_CLASS,
  ContentImportTarget.ACADEMIC_CHAPTER,
  ContentImportTarget.ACADEMIC_TOPIC,
  ContentImportTarget.ACADEMIC_SUBTOPIC,
  ContentImportTarget.VIDEO,
]);

@Injectable()
export class ContentImportsService {
  constructor(
    private readonly db: PrismaService,
  ) {}

  async preview(actorUserId: string, dto: PreviewContentImportDto, file?: UploadedImportFile) {
    const parsed = parseImportFile(file);
    this.assertHeaders(dto.target, parsed.headers);
    this.assertStrategy(dto.target, dto.duplicateStrategy);

    const seen = new Set<string>();
    const rows: RowResult[] = [];
    for (const [index, row] of parsed.rows.entries()) {
      const rowNumber = index + 2;
      try {
        const prepared = await this.prepare(dto.target, row, this.db);
        if (seen.has(prepared.naturalKey)) {
          throw this.rowError('IMPORT_DUPLICATE', 'Duplicate natural key within the import file.');
        }
        seen.add(prepared.naturalKey);
        const existing = await this.findExisting(dto.target, prepared.data, this.db);
        if (existing && dto.duplicateStrategy === ContentImportDuplicateStrategy.ERROR) {
          throw this.rowError('IMPORT_DUPLICATE', 'A matching record already exists.');
        }
        rows.push({
          rowNumber,
          normalizedData: row as Prisma.InputJsonValue,
          status: ContentImportRowStatus.VALID,
        });
      } catch (error) {
        if (!this.isRowError(error)) {
          throw error;
        }
        const failure = error;
        rows.push({
          rowNumber,
          normalizedData: row as Prisma.InputJsonValue,
          status: ContentImportRowStatus.INVALID,
          errorCode: failure.code,
          errorMessage: failure.message,
        });
      }
    }

    const validRows = rows.filter((row) => row.status === ContentImportRowStatus.VALID).length;
    const job = await this.db.contentImportJob.create({
      data: {
        target: dto.target,
        originalFilename: parsed.filename,
        checksum: parsed.checksum,
        duplicateStrategy: dto.duplicateStrategy,
        createdByUserId: actorUserId,
        totalRows: rows.length,
        validRows,
        invalidRows: rows.length - validRows,
        rows: { create: rows },
      },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });

    return {
      jobId: job.id,
      status: job.status,
      summary: this.summary(job),
      rows: job.rows,
    };
  }

  async list(query: ContentImportListDto = new ContentImportListDto()) {
    const [items, total] = await this.db.$transaction([
      this.db.contentImportJob.findMany({
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.contentImportJob.count(),
    ]);
    return this.paginated(items, query.page, query.limit, total);
  }

  async get(id: string) {
    const job = await this.db.contentImportJob.findUnique({ where: { id } });
    if (!job) throw this.notFound();
    return job;
  }

  async rows(id: string, query: ContentImportListDto = new ContentImportListDto()) {
    await this.get(id);
    const [items, total] = await this.db.$transaction([
      this.db.contentImportRow.findMany({
        where: { jobId: id },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { rowNumber: 'asc' },
      }),
      this.db.contentImportRow.count({ where: { jobId: id } }),
    ]);
    return this.paginated(items, query.page, query.limit, total);
  }

  async apply(id: string, actorUserId: string) {
    const reservation = await this.db.contentImportJob.updateMany({
      where: { id, status: ContentImportStatus.PREVIEWED },
      data: { status: ContentImportStatus.APPLYING },
    });
    if (reservation.count !== 1) {
      const job = await this.db.contentImportJob.findUnique({ where: { id } });
      if (!job) throw this.notFound();
      if (job.status === ContentImportStatus.APPLIED) {
        throw new ConflictException({ code: 'IMPORT_ALREADY_APPLIED', message: 'This import has already been applied.' });
      }
      throw new BadRequestException({ code: 'IMPORT_JOB_NOT_READY', message: 'This import is not ready to apply.' });
    }

    let activeRowId: string | undefined;
    try {
      const job = await this.db.$transaction(async (tx) => {
        const job = await tx.contentImportJob.findUnique({
          where: { id }, include: { rows: { orderBy: { rowNumber: 'asc' } } },
        });
        if (!job || job.invalidRows > 0) {
          throw this.rowError('IMPORT_JOB_NOT_READY', 'All rows must be valid before apply.');
        }
        const counters = { insertedRows: 0, updatedRows: 0, skippedRows: 0 };
        for (const row of job.rows) {
          activeRowId = row.id;
          if (row.status !== ContentImportRowStatus.VALID) {
            throw this.rowError('IMPORT_JOB_NOT_READY', 'Import rows are not ready to apply.');
          }
          const prepared = await this.prepare(job.target, row.normalizedData as RowData, tx);
          const applied = await this.applyPreparedRow(tx, job.target, prepared.data, job.duplicateStrategy);
          if (applied.action === 'SKIP') counters.skippedRows += 1;
          if (applied.action === 'CREATE') counters.insertedRows += 1;
          if (applied.action === 'UPDATE') counters.updatedRows += 1;
          if (applied.action !== 'SKIP') {
            await tx.contentAuditEvent.create({
              data: {
                actorUserId,
                entityType: job.target,
                entityId: String(applied.entity.id),
                action: applied.action,
                beforeData: applied.action === 'UPDATE' ? this.snapshot((applied.entity as { __before?: unknown }).__before) : undefined,
                afterData: this.snapshot(this.afterSnapshot(applied.entity)),
                importJobId: job.id,
              },
            });
          }
          await tx.contentImportRow.update({
            where: { id: row.id },
            data: {
              status: applied.action === 'SKIP' ? ContentImportRowStatus.SKIPPED : ContentImportRowStatus.APPLIED,
              resultingEntityId: String(applied.entity.id),
              errorCode: null,
              errorMessage: null,
            },
          });
        }
        return tx.contentImportJob.update({
          where: { id },
          data: {
            status: ContentImportStatus.APPLIED,
            appliedAt: new Date(),
            failedRows: 0,
            ...counters,
          },
        });
      });
      return { jobId: job.id, status: job.status, summary: this.summary(job) };
    } catch (error) {
      const failure = this.isRowError(error) ? error : undefined;
      await this.db.contentImportJob.update({
        where: { id },
        data: { status: ContentImportStatus.FAILED, failedRows: failure ? 1 : 0 },
      });
      if (failure && activeRowId) {
        await this.db.contentImportRow.update({
          where: { id: activeRowId },
          data: {
            status: ContentImportRowStatus.FAILED,
            errorCode: failure.code,
            errorMessage: failure.message,
          },
        });
      }
      if (failure) {
        throw new BadRequestException({ code: failure.code, message: failure.message });
      }
      throw error;
    }
  }

  private assertHeaders(target: ContentImportTarget, headers: string[]) {
    const missing = REQUIRED_HEADERS[target].filter((header) => !headers.includes(header));
    if (missing.length) {
      throw new BadRequestException({ code: 'IMPORT_INVALID_HEADERS', message: `Missing required headers: ${missing.join(', ')}.` });
    }
  }

  private assertStrategy(target: ContentImportTarget, strategy: ContentImportDuplicateStrategy) {
    if (strategy === ContentImportDuplicateStrategy.UPDATE && !UPDATE_SUPPORTED.has(target)) {
      throw new BadRequestException({ code: 'IMPORT_INVALID_HEADERS', message: 'UPDATE is only supported for targets with database-enforced natural keys.' });
    }
    if (strategy === ContentImportDuplicateStrategy.SKIP && !UPDATE_SUPPORTED.has(target)) {
      throw new BadRequestException({ code: 'IMPORT_INVALID_HEADERS', message: 'SKIP is only supported for targets with database-enforced natural keys.' });
    }
  }

  private async prepare(target: ContentImportTarget, row: RowData, client: ImportClient): Promise<PreparedRow> {
    this.assertRequiredValues(target, row);
    this.assertFieldLengths(row);
    if (target.startsWith('ACADEMIC_')) return this.prepareAcademic(target, row, client);
    const hierarchy = await this.resolveHierarchy(row, client);
    const states = this.states(row);
    const mediaAssetId = await this.resolveMediaAsset(row, client);
    if (target === ContentImportTarget.VIDEO) {
      const provider = this.videoProvider(row.provider || VideoProvider.LOCAL);
      return {
        naturalKey: `video:${row.slug}`,
        data: {
          ...hierarchy, ...states, title: row.title, slug: row.slug,
          description: this.optional(row.description), instructorName: this.optional(row.instructor_name),
          thumbnailUrl: this.optional(row.thumbnail_url), provider, providerAssetId: row.provider_asset_id,
          playbackId: this.optional(row.playback_id), durationSeconds: this.integer(row.duration_seconds, 'duration_seconds'),
          displayOrder: this.integer(row.display_order, 'display_order') ?? 0,
          isFree: this.boolean(row.is_free, 'is_free', true), mediaAssetId,
        },
      };
    }
    if (target === ContentImportTarget.REVISION_ITEM) {
      const type = this.revisionType(row.type);
      return {
        naturalKey: `revision:${hierarchy.topicId}:${hierarchy.subtopicId ?? ''}:${type}:${row.title}`,
        data: { ...hierarchy, ...states, title: row.title, type, content: row.content, displayOrder: this.integer(row.display_order, 'display_order') ?? 0 },
      };
    }
    return {
      naturalKey: `flashcard:${hierarchy.topicId}:${hierarchy.subtopicId ?? ''}:${row.front_content}`,
      data: {
        ...hierarchy, ...states, title: this.optional(row.title), frontContent: row.front_content,
        backContent: row.back_content, explanation: this.optional(row.explanation), imageUrl: this.optional(row.image_url),
        isPremium: this.boolean(row.is_premium, 'is_premium', false), sortOrder: this.integer(row.sort_order, 'sort_order') ?? 0,
        mediaAssetId,
      },
    };
  }

  private async prepareAcademic(target: ContentImportTarget, row: RowData, client: ImportClient): Promise<PreparedRow> {
    const states = this.states(row, true);
    const base = { name: row.name, slug: row.slug, displayOrder: this.integer(row.display_order, 'display_order') ?? 0, ...states };
    if (target === ContentImportTarget.ACADEMIC_EXAM) return { naturalKey: `exam:${row.slug}`, data: base };
    const hierarchy = await this.resolveAcademicParents(target, row, client);
    return { naturalKey: `${target}:${Object.values(hierarchy).join(':')}:${row.slug}`, data: { ...base, ...hierarchy } };
  }

  private async resolveHierarchy(row: RowData, client: ImportClient) {
    const exam = await client.exam.findUnique({ where: { slug: row.exam_slug } });
    if (!exam) throw this.rowError('IMPORT_ROW_INVALID', 'exam_slug does not resolve to an exam.');
    const subject = await client.subject.findUnique({ where: { examId_slug: { examId: exam.id, slug: row.subject_slug } } });
    if (!subject) throw this.rowError('IMPORT_ROW_INVALID', 'subject_slug does not resolve within the supplied exam.');
    const academicClass = await client.academicClass.findUnique({ where: { subjectId_slug: { subjectId: subject.id, slug: row.class_slug } } });
    if (!academicClass) throw this.rowError('IMPORT_ROW_INVALID', 'class_slug does not resolve within the supplied subject.');
    const chapter = await client.chapter.findUnique({ where: { classId_slug: { classId: academicClass.id, slug: row.chapter_slug } } });
    if (!chapter) throw this.rowError('IMPORT_ROW_INVALID', 'chapter_slug does not resolve within the supplied class.');
    const topic = await client.topic.findUnique({ where: { chapterId_slug: { chapterId: chapter.id, slug: row.topic_slug } } });
    if (!topic) throw this.rowError('IMPORT_ROW_INVALID', 'topic_slug does not resolve within the supplied chapter.');
    let subtopicId: string | undefined;
    if (this.optional(row.subtopic_slug)) {
      const subtopic = await client.subtopic.findUnique({ where: { topicId_slug: { topicId: topic.id, slug: row.subtopic_slug } } });
      if (!subtopic) throw this.rowError('IMPORT_ROW_INVALID', 'subtopic_slug does not resolve within the supplied topic.');
      subtopicId = subtopic.id;
    }
    return { examId: exam.id, subjectId: subject.id, academicClassId: academicClass.id, chapterId: chapter.id, topicId: topic.id, subtopicId };
  }

  private async resolveAcademicParents(target: ContentImportTarget, row: RowData, client: ImportClient) {
    const exam = await client.exam.findUnique({ where: { slug: row.exam_slug } });
    if (!exam) throw this.rowError('IMPORT_ROW_INVALID', 'exam_slug does not resolve to an exam.');
    if (target === ContentImportTarget.ACADEMIC_SUBJECT) return { examId: exam.id };
    const subject = await client.subject.findUnique({ where: { examId_slug: { examId: exam.id, slug: row.subject_slug } } });
    if (!subject) throw this.rowError('IMPORT_ROW_INVALID', 'subject_slug does not resolve within the supplied exam.');
    if (target === ContentImportTarget.ACADEMIC_CLASS) return { subjectId: subject.id };
    const academicClass = await client.academicClass.findUnique({ where: { subjectId_slug: { subjectId: subject.id, slug: row.class_slug } } });
    if (!academicClass) throw this.rowError('IMPORT_ROW_INVALID', 'class_slug does not resolve within the supplied subject.');
    if (target === ContentImportTarget.ACADEMIC_CHAPTER) return { classId: academicClass.id };
    const chapter = await client.chapter.findUnique({ where: { classId_slug: { classId: academicClass.id, slug: row.chapter_slug } } });
    if (!chapter) throw this.rowError('IMPORT_ROW_INVALID', 'chapter_slug does not resolve within the supplied class.');
    if (target === ContentImportTarget.ACADEMIC_TOPIC) return { chapterId: chapter.id };
    const topic = await client.topic.findUnique({ where: { chapterId_slug: { chapterId: chapter.id, slug: row.topic_slug } } });
    if (!topic) throw this.rowError('IMPORT_ROW_INVALID', 'topic_slug does not resolve within the supplied chapter.');
    return { topicId: topic.id };
  }

  private async resolveMediaAsset(row: RowData, client: ImportClient): Promise<string | undefined> {
    const provider = this.optional(row.media_provider);
    const externalKey = this.optional(row.media_external_key);
    if (!provider && !externalKey) return undefined;
    if (!provider || !externalKey) throw this.rowError('IMPORT_ROW_INVALID', 'media_provider and media_external_key must be supplied together.');
    const asset = await client.mediaAsset.findUnique({ where: { provider_externalKey: { provider, externalKey } } });
    if (!asset) throw this.rowError('IMPORT_ROW_INVALID', 'Media asset reference does not exist.');
    if (!asset.isActive) throw this.rowError('IMPORT_ROW_INVALID', 'Inactive media assets cannot be assigned.');
    return asset.id;
  }

  private async findExisting(target: ContentImportTarget, data: Record<string, unknown>, client: ImportClient): Promise<Record<string, unknown> | null> {
    switch (target) {
      case ContentImportTarget.ACADEMIC_EXAM: return client.exam.findUnique({ where: { slug: String(data.slug) } }) as Promise<Record<string, unknown> | null>;
      case ContentImportTarget.ACADEMIC_SUBJECT: return client.subject.findUnique({ where: { examId_slug: { examId: String(data.examId), slug: String(data.slug) } } }) as Promise<Record<string, unknown> | null>;
      case ContentImportTarget.ACADEMIC_CLASS: return client.academicClass.findUnique({ where: { subjectId_slug: { subjectId: String(data.subjectId), slug: String(data.slug) } } }) as Promise<Record<string, unknown> | null>;
      case ContentImportTarget.ACADEMIC_CHAPTER: return client.chapter.findUnique({ where: { classId_slug: { classId: String(data.classId), slug: String(data.slug) } } }) as Promise<Record<string, unknown> | null>;
      case ContentImportTarget.ACADEMIC_TOPIC: return client.topic.findUnique({ where: { chapterId_slug: { chapterId: String(data.chapterId), slug: String(data.slug) } } }) as Promise<Record<string, unknown> | null>;
      case ContentImportTarget.ACADEMIC_SUBTOPIC: return client.subtopic.findUnique({ where: { topicId_slug: { topicId: String(data.topicId), slug: String(data.slug) } } }) as Promise<Record<string, unknown> | null>;
      case ContentImportTarget.VIDEO: return client.video.findUnique({ where: { slug: String(data.slug) } }) as Promise<Record<string, unknown> | null>;
      case ContentImportTarget.REVISION_ITEM: {
        const matches = await client.revisionItem.findMany({ where: { topicId: String(data.topicId), subtopicId: data.subtopicId as string | undefined, type: data.type as RevisionType, title: String(data.title) }, take: 2 });
        if (matches.length > 1) throw this.rowError('IMPORT_DUPLICATE', 'Revision natural key is ambiguous.');
        return (matches[0] ?? null) as Record<string, unknown> | null;
      }
      case ContentImportTarget.FLASHCARD: {
        const matches = await client.flashcard.findMany({ where: { topicId: String(data.topicId), subtopicId: data.subtopicId as string | undefined, frontContent: String(data.frontContent) }, take: 2 });
        if (matches.length > 1) throw this.rowError('IMPORT_DUPLICATE', 'Flashcard natural key is ambiguous.');
        return (matches[0] ?? null) as Record<string, unknown> | null;
      }
    }
    throw this.rowError('IMPORT_ROW_INVALID', 'Unsupported import target.');
  }

  private async applyPreparedRow(client: Prisma.TransactionClient, target: ContentImportTarget, data: Record<string, unknown>, strategy: ContentImportDuplicateStrategy): Promise<ApplyResult> {
    const existing = await this.findExisting(target, data, client);
    if (existing) {
      if (strategy === ContentImportDuplicateStrategy.ERROR) throw this.rowError('IMPORT_DUPLICATE', 'A matching record already exists.');
      if (strategy === ContentImportDuplicateStrategy.SKIP) return { entity: existing, action: 'SKIP' };
      const updated = await this.updateTarget(client, target, String(existing.id), data);
      return { entity: { ...updated, __before: existing }, action: 'UPDATE' };
    }
    const created = await this.createTarget(client, target, data);
    return { entity: created, action: 'CREATE' };
  }

  private createTarget(client: Prisma.TransactionClient, target: ContentImportTarget, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.targetModel(client, target).create({ data }) as Promise<Record<string, unknown>>;
  }

  private updateTarget(client: Prisma.TransactionClient, target: ContentImportTarget, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.targetModel(client, target).update({ where: { id }, data }) as Promise<Record<string, unknown>>;
  }

  private targetModel(client: Prisma.TransactionClient, target: ContentImportTarget): { create: (args: unknown) => unknown; update: (args: unknown) => unknown } {
    const models = {
      [ContentImportTarget.ACADEMIC_EXAM]: client.exam,
      [ContentImportTarget.ACADEMIC_SUBJECT]: client.subject,
      [ContentImportTarget.ACADEMIC_CLASS]: client.academicClass,
      [ContentImportTarget.ACADEMIC_CHAPTER]: client.chapter,
      [ContentImportTarget.ACADEMIC_TOPIC]: client.topic,
      [ContentImportTarget.ACADEMIC_SUBTOPIC]: client.subtopic,
      [ContentImportTarget.VIDEO]: client.video,
      [ContentImportTarget.REVISION_ITEM]: client.revisionItem,
      [ContentImportTarget.FLASHCARD]: client.flashcard,
    };
    return models[target] as unknown as { create: (args: unknown) => unknown; update: (args: unknown) => unknown };
  }

  private states(row: RowData, publishedDefault = false) {
    return {
      isActive: this.boolean(row.is_active, 'is_active', true),
      isPublished: this.boolean(row.is_published, 'is_published', publishedDefault),
    };
  }

  private boolean(value: string | undefined, field: string, fallback: boolean): boolean {
    if (!value) return fallback;
    if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
    if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
    throw this.rowError('IMPORT_ROW_INVALID', `${field} must be a boolean.`);
  }

  private integer(value: string | undefined, field: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw this.rowError('IMPORT_ROW_INVALID', `${field} must be a non-negative integer.`);
    return parsed;
  }

  private revisionType(value: string): RevisionType {
    if (!Object.values(RevisionType).includes(value as RevisionType)) throw this.rowError('IMPORT_ROW_INVALID', 'type is not a supported revision type.');
    return value as RevisionType;
  }

  private videoProvider(value: string): VideoProvider {
    if (!Object.values(VideoProvider).includes(value as VideoProvider)) throw this.rowError('IMPORT_ROW_INVALID', 'provider is not supported.');
    return value as VideoProvider;
  }

  private assertRequiredValues(target: ContentImportTarget, row: RowData) {
    const missing = REQUIRED_HEADERS[target].filter((field) => !this.optional(row[field]));
    if (missing.length) throw this.rowError('IMPORT_ROW_INVALID', `Missing required values: ${missing.join(', ')}.`);
  }

  private assertFieldLengths(row: RowData) {
    const limits: Record<string, number> = {
      name: 255, slug: 255, title: 500, provider: 100, provider_asset_id: 512,
      playback_id: 512, media_provider: 100, media_external_key: 512, image_url: 2048,
      thumbnail_url: 2048, instructor_name: 255, type: 100,
    };
    for (const [field, value] of Object.entries(row)) {
      const limit = limits[field] ?? 20_000;
      if (value.length > limit) {
        throw this.rowError('IMPORT_ROW_INVALID', `${field} exceeds the permitted length.`);
      }
    }
  }

  private optional(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
  }

  private rowError(code: string, message: string) { return { code, message }; }
  private isRowError(error: unknown): error is { code: string; message: string } {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && typeof error.code === 'string'
      && 'message' in error
      && typeof error.message === 'string';
  }
  private notFound() { return new NotFoundException({ code: 'IMPORT_JOB_NOT_FOUND', message: 'Import job not found.' }); }
  private paginated<T>(items: T[], page: number, limit: number, total: number) { return { items, meta: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) } }; }
  private summary(job: { totalRows: number; validRows: number; invalidRows: number; insertedRows: number; updatedRows: number; skippedRows: number; failedRows: number }) { return { totalRows: job.totalRows, validRows: job.validRows, invalidRows: job.invalidRows, insertedRows: job.insertedRows, updatedRows: job.updatedRows, skippedRows: job.skippedRows, failedRows: job.failedRows }; }
  private snapshot(value: unknown): Prisma.InputJsonValue | undefined { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
  private afterSnapshot(entity: Record<string, unknown>) { const { __before: _before, ...after } = entity; return after; }
}
