import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DailyStudyModuleStatus,
  DailyStudyTaskStatus,
  Prisma,
  RoleName,
} from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { PhysicsDailyStudyStrategy } from './physics-daily-study.strategy';
import { ChemistryDailyStudyStrategy } from './chemistry-daily-study.strategy';
import { BiologyDailyStudyStrategy } from './biology-daily-study.strategy';

const neetExamSlug = 'neet';
const pcbSubjectSlugs = ['physics', 'chemistry', 'biology'] as const;

export type DailyStudyDateInput = Date | string;

export type DailyStudySubjectPlan = {
  subjectId: string;
  subjectName: string;
  subjectSlug: (typeof pcbSubjectSlugs)[number];
  desiredQuestionCount: number;
  desiredFlashcardCount: number;
  desiredRevisionCount: number;
  desiredVideoCount: number;
  reason: 'PHASE_8B_FOUNDATION';
};

export type DailyStudyPersonalizationContext = {
  studyDate: Date;
  subjectPlans: DailyStudySubjectPlan[];
  recentActivity: {
    questionPracticeSessions: number;
    flashcardReviews: number;
    videoProgressEntries: number;
    formalTestAttempts: number;
  };
};

@Injectable()
export class DailyStudyService {
  constructor(
    private readonly db: PrismaService,
    private readonly physicsStrategy: PhysicsDailyStudyStrategy,
    private readonly chemistryStrategy: ChemistryDailyStudyStrategy,
    private readonly biologyStrategy: BiologyDailyStudyStrategy,
  ) {}

  async generatePhysicsDailyTasks(
    studentId: string,
    studyDateInput: DailyStudyDateInput,
  ) {
    const module = await this.getOrCreateDailyModule(studentId, studyDateInput);
    const physics = (await this.resolvePcbSubjects()).find(
      (subject) => subject.slug === 'physics',
    );
    if (!physics) {
      throw new NotFoundException({
        code: 'DAILY_STUDY_PCB_SUBJECT_UNAVAILABLE',
        message: 'An active published NEET physics subject is required.',
      });
    }
    return this.physicsStrategy.populate(studentId, module.id, physics);
  }

  async generateChemistryDailyTasks(
    studentId: string,
    studyDateInput: DailyStudyDateInput,
  ) {
    const module = await this.getOrCreateDailyModule(studentId, studyDateInput);
    const chemistry = (await this.resolvePcbSubjects()).find(
      (subject) => subject.slug === 'chemistry',
    );
    if (!chemistry) {
      throw new NotFoundException({
        code: 'DAILY_STUDY_PCB_SUBJECT_UNAVAILABLE',
        message: 'An active published NEET chemistry subject is required.',
      });
    }
    return this.chemistryStrategy.populate(studentId, module.id, chemistry);
  }

  async generateBiologyDailyTasks(
    studentId: string,
    studyDateInput: DailyStudyDateInput,
  ) {
    const module = await this.getOrCreateDailyModule(studentId, studyDateInput);
    const biology = (await this.resolvePcbSubjects()).find(
      (subject) => subject.slug === 'biology',
    );
    if (!biology) {
      throw new NotFoundException({
        code: 'DAILY_STUDY_PCB_SUBJECT_UNAVAILABLE',
        message: 'An active published NEET biology subject is required.',
      });
    }
    return this.biologyStrategy.populate(studentId, module.id, biology);
  }

  async getOrGenerateDailyModule(
    studentId: string,
    studyDateInput: DailyStudyDateInput,
  ) {
    const module = await this.getOrCreateDailyModule(studentId, studyDateInput);
    await this.generatePhysicsDailyTasks(studentId, module.studyDate);
    await this.generateChemistryDailyTasks(studentId, module.studyDate);
    await this.generateBiologyDailyTasks(studentId, module.studyDate);
    return this.readDailyModule(studentId, module.id);
  }

  async updateTaskStatus(
    studentId: string,
    taskId: string,
    requestedStatus: DailyStudyTaskStatus,
  ) {
    if (requestedStatus === DailyStudyTaskStatus.PENDING) {
      throw new BadRequestException({
        code: 'DAILY_STUDY_INVALID_TASK_STATUS',
        message: 'Tasks cannot be reset to pending.',
      });
    }
    const moduleId = await this.db.$transaction(async (tx) => {
      const task = await tx.dailyStudyTask.findFirst({
        where: { id: taskId, module: { is: { studentId } } },
        select: { id: true, moduleId: true, status: true, startedAt: true, completedAt: true },
      });
      if (!task) {
        throw new NotFoundException({
          code: 'DAILY_STUDY_TASK_NOT_FOUND',
          message: 'Daily study task not found.',
        });
      }
      if (task.status === requestedStatus) {
        return task.moduleId;
      }
      if (
        task.status === DailyStudyTaskStatus.COMPLETED ||
        task.status === DailyStudyTaskStatus.SKIPPED
      ) {
        throw new ForbiddenException({
          code: 'DAILY_STUDY_TASK_TERMINAL',
          message: 'This daily study task is already terminal.',
        });
      }

      const now = new Date();
      const isCompleted = requestedStatus === DailyStudyTaskStatus.COMPLETED;
      await tx.dailyStudyTask.update({
        where: { id: task.id },
        data: {
          status: requestedStatus,
          startedAt: requestedStatus === DailyStudyTaskStatus.SKIPPED
            ? task.startedAt
            : task.startedAt ?? now,
          completedAt: isCompleted ? task.completedAt ?? now : task.completedAt,
        },
      });
      const tasks = await tx.dailyStudyTask.findMany({
        where: { moduleId: task.moduleId },
        select: { status: true },
      });
      const finished = tasks.length > 0 && tasks.every(
        (item) => item.status === DailyStudyTaskStatus.COMPLETED ||
          item.status === DailyStudyTaskStatus.SKIPPED,
      );
      const hasActivity = tasks.some(
        (item) => item.status !== DailyStudyTaskStatus.PENDING,
      );
      const module = await tx.dailyStudyModule.findUnique({
        where: { id: task.moduleId },
        select: { startedAt: true, completedAt: true },
      });
      if (!module) {
        throw new NotFoundException({
          code: 'DAILY_STUDY_MODULE_NOT_FOUND',
          message: 'Daily study module not found.',
        });
      }
      await tx.dailyStudyModule.update({
        where: { id: task.moduleId },
        data: {
          status: finished
            ? DailyStudyModuleStatus.COMPLETED
            : hasActivity
              ? DailyStudyModuleStatus.IN_PROGRESS
              : DailyStudyModuleStatus.NOT_STARTED,
          startedAt: hasActivity ? module.startedAt ?? now : module.startedAt,
          completedAt: finished ? module.completedAt ?? now : module.completedAt,
        },
      });
      return task.moduleId;
    });
    return this.readDailyModule(studentId, moduleId);
  }

  async getOrCreateDailyModule(
    studentId: string,
    studyDateInput: DailyStudyDateInput,
  ) {
    const studyDate = this.normalizeStudyDate(studyDateInput);
    await this.requireStudent(studentId);
    await this.resolvePcbSubjects();

    const existing = await this.db.dailyStudyModule.findUnique({
      where: { studentId_studyDate: { studentId, studyDate } },
      include: this.moduleInclude(),
    });
    if (existing) {
      return existing;
    }

    try {
      return await this.db.dailyStudyModule.create({
        data: {
          studentId,
          studyDate,
          status: DailyStudyModuleStatus.NOT_STARTED,
        },
        include: this.moduleInclude(),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrentModule = await this.db.dailyStudyModule.findUnique({
          where: { studentId_studyDate: { studentId, studyDate } },
          include: this.moduleInclude(),
        });
        if (concurrentModule) {
          return concurrentModule;
        }
      }
      throw error;
    }
  }

  async buildPersonalizationContext(
    studentId: string,
    studyDateInput: DailyStudyDateInput,
  ): Promise<DailyStudyPersonalizationContext> {
    const studyDate = this.normalizeStudyDate(studyDateInput);
    await this.requireStudent(studentId);

    const [subjects, questionPracticeSessions, flashcardReviews, videoProgressEntries, formalTestAttempts] =
        await Promise.all([
          this.resolvePcbSubjects(),
          this.db.questionPracticeSession.count({ where: { studentId } }),
          this.db.flashcardProgress.count({ where: { studentId } }),
          this.db.videoProgress.count({ where: { studentId } }),
          this.db.testAttempt.count({ where: { studentId } }),
        ]);

    return {
      studyDate,
      subjectPlans: subjects.map((subject) => ({
        subjectId: subject.id,
        subjectName: subject.name,
        subjectSlug: subject.slug as (typeof pcbSubjectSlugs)[number],
        desiredQuestionCount: 0,
        desiredFlashcardCount: 0,
        desiredRevisionCount: 0,
        desiredVideoCount: 0,
        reason: 'PHASE_8B_FOUNDATION',
      })),
      recentActivity: {
        questionPracticeSessions,
        flashcardReviews,
        videoProgressEntries,
        formalTestAttempts,
      },
    };
  }

  normalizeStudyDate(input: DailyStudyDateInput): Date {
    if (input instanceof Date) {
      if (Number.isNaN(input.getTime())) {
        throw this.invalidStudyDate();
      }
      return new Date(
        Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()),
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      throw this.invalidStudyDate();
    }

    const [year, month, day] = input.split('-').map(Number);
    const normalized = new Date(Date.UTC(year, month - 1, day));
    if (
      normalized.getUTCFullYear() !== year ||
      normalized.getUTCMonth() !== month - 1 ||
      normalized.getUTCDate() !== day
    ) {
      throw this.invalidStudyDate();
    }
    return normalized;
  }

  private async requireStudent(studentId: string) {
    const user = await this.db.user.findUnique({
      where: { id: studentId },
      select: {
        isActive: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'DAILY_STUDY_STUDENT_NOT_FOUND',
        message: 'Student not found.',
      });
    }
    if (
      !user.isActive ||
      !user.roles.some(({ role }) => role.name === RoleName.STUDENT)
    ) {
      throw new ForbiddenException({
        code: 'DAILY_STUDY_STUDENT_REQUIRED',
        message: 'Daily study modules are available to active students only.',
      });
    }
  }

  private async readDailyModule(studentId: string, moduleId: string) {
    const module = await this.db.dailyStudyModule.findFirst({
      where: { id: moduleId, studentId },
      select: {
        id: true,
        studyDate: true,
        status: true,
        generatedAt: true,
        startedAt: true,
        completedAt: true,
        tasks: {
          orderBy: [{ subject: { slug: 'asc' } }, { displayOrder: 'asc' }],
          select: {
            id: true,
            type: true,
            status: true,
            displayOrder: true,
            subject: { select: { id: true, name: true, slug: true } },
            chapter: { select: { id: true, name: true, slug: true } },
            topic: { select: { id: true, name: true, slug: true } },
            subtopic: { select: { id: true, name: true, slug: true } },
            questionId: true,
            flashcardId: true,
            revisionItemId: true,
            videoId: true,
          },
        },
      },
    });
    if (!module) {
      throw new NotFoundException({
        code: 'DAILY_STUDY_MODULE_NOT_FOUND',
        message: 'Daily study module not found.',
      });
    }

    const taskIds = {
      questions: module.tasks.flatMap((task) => task.questionId ? [task.questionId] : []),
      flashcards: module.tasks.flatMap((task) => task.flashcardId ? [task.flashcardId] : []),
      revisions: module.tasks.flatMap((task) => task.revisionItemId ? [task.revisionItemId] : []),
      videos: module.tasks.flatMap((task) => task.videoId ? [task.videoId] : []),
    };
    const [questions, flashcards, revisions, videos] = await Promise.all([
      this.db.question.findMany({
        where: { id: { in: taskIds.questions }, isActive: true, isPublished: true, isFree: true },
        select: { id: true, stem: true, type: true, difficulty: true, tags: true, options: { select: { id: true, position: true, text: true }, orderBy: { position: 'asc' } } },
      }),
      this.db.flashcard.findMany({
        where: { id: { in: taskIds.flashcards }, isActive: true, isPublished: true, isPremium: false },
        select: { id: true, title: true, frontContent: true, backContent: true, explanation: true, imageUrl: true },
      }),
      this.db.revisionItem.findMany({
        where: { id: { in: taskIds.revisions }, isActive: true, isPublished: true },
        select: { id: true, title: true, type: true, content: true },
      }),
      this.db.video.findMany({
        where: { id: { in: taskIds.videos }, isActive: true, isPublished: true, isFree: true },
        select: { id: true, title: true, description: true, instructorName: true, thumbnailUrl: true, durationSeconds: true, displayOrder: true },
      }),
    ]);
    const content = new Map<string, unknown>();
    for (const item of [...questions, ...flashcards, ...revisions, ...videos]) {
      content.set(item.id, item);
    }
    const subjectOrder = ['physics', 'chemistry', 'biology'];
    const summary = this.progressSummary(module.tasks);
    const grouped = subjectOrder.flatMap((slug) => {
      const tasks = module.tasks
        .filter((task) => task.subject.slug === slug)
        .sort((left, right) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id))
        .map((task) => {
          const sourceId = task.questionId ?? task.flashcardId ?? task.revisionItemId ?? task.videoId;
          return {
            id: task.id,
            taskType: task.type,
            status: task.status,
            displayOrder: task.displayOrder,
            hierarchy: { chapter: task.chapter, topic: task.topic, subtopic: task.subtopic },
            available: sourceId !== null && content.has(sourceId),
            content: sourceId ? content.get(sourceId) ?? null : null,
          };
        });
      return tasks.length === 0 ? [] : [{ subject: module.tasks.find((task) => task.subject.slug === slug)!.subject, tasks }];
    });
    return {
      id: module.id,
      studyDate: module.studyDate,
      status: module.status,
      generatedAt: module.generatedAt,
      startedAt: module.startedAt,
      completedAt: module.completedAt,
      progress: summary.overall,
      subjects: grouped.map((group) => ({
        ...group,
        progress: this.progressSummary(
          module.tasks.filter((task) => task.subject.slug === group.subject.slug),
        ).overall,
      })),
    };
  }

  private progressSummary(
    tasks: { status: DailyStudyTaskStatus }[],
  ) {
    const totalTasks = tasks.length;
    const pendingTasks = tasks.filter((task) => task.status === DailyStudyTaskStatus.PENDING).length;
    const inProgressTasks = tasks.filter((task) => task.status === DailyStudyTaskStatus.IN_PROGRESS).length;
    const completedTasks = tasks.filter((task) => task.status === DailyStudyTaskStatus.COMPLETED).length;
    const skippedTasks = tasks.filter((task) => task.status === DailyStudyTaskStatus.SKIPPED).length;
    const finishedTasks = completedTasks + skippedTasks;
    return {
      overall: {
        totalTasks,
        pendingTasks,
        inProgressTasks,
        completedTasks,
        skippedTasks,
        finishedTasks,
        completionPercent: totalTasks === 0 ? 0 : Math.round((finishedTasks / totalTasks) * 100),
      },
    };
  }

  private async resolvePcbSubjects() {
    const subjects = await this.db.subject.findMany({
      where: {
        slug: { in: [...pcbSubjectSlugs] },
        isActive: true,
        isPublished: true,
        exam: {
          is: {
            slug: neetExamSlug,
            isActive: true,
            isPublished: true,
          },
        },
      },
      select: { id: true, name: true, slug: true },
      orderBy: { slug: 'asc' },
    });

    const bySlug = new Map<string, (typeof subjects)[number][]>();
    for (const subject of subjects) {
      const matching = bySlug.get(subject.slug) ?? [];
      matching.push(subject);
      bySlug.set(subject.slug, matching);
    }

    const resolved = pcbSubjectSlugs.map((slug) => {
      const matches = bySlug.get(slug) ?? [];
      if (matches.length !== 1) {
        throw new NotFoundException({
          code: 'DAILY_STUDY_PCB_SUBJECT_UNAVAILABLE',
          message: `A single active published NEET ${slug} subject is required.`,
        });
      }
      return matches[0];
    });
    return resolved;
  }

  private moduleInclude() {
    return {
      tasks: {
        orderBy: [
          { subjectId: 'asc' as const },
          { displayOrder: 'asc' as const },
          { id: 'asc' as const },
        ],
      },
    };
  }

  private invalidStudyDate() {
    return new BadRequestException({
      code: 'DAILY_STUDY_INVALID_DATE',
      message: 'Study date must be a valid ISO calendar date (YYYY-MM-DD).',
    });
  }
}
