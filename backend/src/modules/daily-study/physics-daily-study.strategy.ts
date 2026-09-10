import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DailyStudyTaskType,
  QuestionDifficulty,
  QuestionSourceType,
  RevisionType,
} from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';

export const physicsDailyTargets = {
  questions: 10,
  flashcards: 5,
  revisionItems: 2,
  videos: 1,
} as const;

type PhysicsSubject = { id: string; name: string; slug: string };
type Candidate = {
  type: DailyStudyTaskType;
  id: string;
  chapterId: string;
  topicId: string;
  subtopicId: string | null;
};
type DailyTaskTargets = {
  questions: number;
  flashcards: number;
  revisionItems: number;
  videos: number;
};

const visible = { isActive: true, isPublished: true };

@Injectable()
export class PhysicsDailyStudyStrategy {
  constructor(private readonly db: PrismaService) {}
  protected readonly targets: DailyTaskTargets = physicsDailyTargets;

  async populate(
    studentId: string,
    moduleId: string,
    physics: PhysicsSubject,
  ) {
    const module = await this.db.dailyStudyModule.findFirst({
      where: { id: moduleId, studentId },
      select: {
        id: true,
        tasks: {
          where: { subjectId: physics.id },
          select: {
            displayOrder: true,
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

    const existing = new Set(
      module.tasks.flatMap((task) =>
        [task.questionId, task.flashcardId, task.revisionItemId, task.videoId]
          .filter((id): id is string => id !== null),
      ),
    );
    const weak = await this.weakPhysicsAreas(studentId, physics.id);
    const candidates = await this.selectCandidates(studentId, physics.id, weak, existing);
    if (candidates.length === 0) {
      return [];
    }

    const firstOrder =
      module.tasks.reduce((highest, task) => Math.max(highest, task.displayOrder), 0) +
      1;
    const data = candidates.map((candidate, index) => ({
      moduleId,
      subjectId: physics.id,
      type: candidate.type,
      displayOrder: firstOrder + index,
      chapterId: candidate.chapterId,
      topicId: candidate.topicId,
      subtopicId: candidate.subtopicId,
      questionId:
        candidate.type === DailyStudyTaskType.QUESTION ? candidate.id : null,
      flashcardId:
        candidate.type === DailyStudyTaskType.FLASHCARD ? candidate.id : null,
      revisionItemId:
        candidate.type === DailyStudyTaskType.REVISION ? candidate.id : null,
      videoId: candidate.type === DailyStudyTaskType.VIDEO ? candidate.id : null,
    }));

    await this.db.$transaction(async (tx) => {
      await tx.dailyStudyTask.createMany({ data, skipDuplicates: true });
    });
    return candidates;
  }

  protected async selectCandidates(
    studentId: string,
    subjectId: string,
    weakTopicIds: Set<string>,
    existing: Set<string>,
  ): Promise<Candidate[]> {
    const hierarchy = this.contentVisibility();
    const [questions, flashcards, revisions, videos] = await Promise.all([
      this.db.question.findMany({
        where: { subjectId, isFree: true, ...hierarchy },
        select: {
          id: true, chapterId: true, topicId: true, subtopicId: true,
          difficulty: true, sourceType: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
      this.db.flashcard.findMany({
        where: { subjectId, isPremium: false, ...hierarchy },
        select: {
          id: true, chapterId: true, topicId: true, subtopicId: true,
          progress: {
            where: { studentId },
            select: { lastReviewedAt: true, reviewCount: true },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.db.revisionItem.findMany({
        where: { subjectId, ...hierarchy },
        select: {
          id: true,
          chapterId: true,
          topicId: true,
          subtopicId: true,
          type: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
      this.db.video.findMany({
        where: { subjectId, isFree: true, ...hierarchy },
        select: {
          id: true, chapterId: true, topicId: true, subtopicId: true,
          progress: {
            where: { studentId },
            select: { completed: true, lastWatchedAt: true },
          },
        },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const selected: Candidate[] = [];
    const append = (items: Candidate[]) => {
      for (const item of items) {
        if (!existing.has(item.id)) {
          existing.add(item.id);
          selected.push(item);
        }
      }
    };
    append(this.pickQuestions(questions, weakTopicIds));
    append(
      flashcards
        .filter((item) => !existing.has(item.id))
        .sort((left, right) => {
          const leftProgress = left.progress[0];
          const rightProgress = right.progress[0];
          const leftTime = leftProgress?.lastReviewedAt?.getTime() ?? 0;
          const rightTime = rightProgress?.lastReviewedAt?.getTime() ?? 0;
          return leftTime - rightTime ||
            (leftProgress?.reviewCount ?? 0) - (rightProgress?.reviewCount ?? 0) ||
            left.id.localeCompare(right.id);
        })
        .slice(0, this.targets.flashcards)
        .map((item) => ({ ...item, type: DailyStudyTaskType.FLASHCARD })),
    );
    append(
      revisions
        .filter((item) => !existing.has(item.id))
        .sort((left, right) =>
          Number(weakTopicIds.has(right.topicId)) -
              Number(weakTopicIds.has(left.topicId)) ||
          this.revisionPriority(right.type) - this.revisionPriority(left.type) ||
          left.id.localeCompare(right.id),
        )
        .slice(0, this.targets.revisionItems)
        .map((item) => ({ ...item, type: DailyStudyTaskType.REVISION })),
    );
    append(
      videos
        .filter((item) => !existing.has(item.id))
        .sort((left, right) => {
          const leftCompleted = left.progress[0]?.completed === true;
          const rightCompleted = right.progress[0]?.completed === true;
          return Number(leftCompleted) - Number(rightCompleted) ||
            Number(weakTopicIds.has(right.topicId)) - Number(weakTopicIds.has(left.topicId)) ||
            left.id.localeCompare(right.id);
        })
        .slice(0, this.targets.videos)
        .map((item) => ({ ...item, type: DailyStudyTaskType.VIDEO })),
    );
    return selected;
  }

  protected pickQuestions(
    questions: {
      id: string; chapterId: string; topicId: string; subtopicId: string | null;
      difficulty: QuestionDifficulty; sourceType: QuestionSourceType;
    }[],
    weakTopicIds: Set<string>,
  ): Candidate[] {
    const difficultyOrder = [
      QuestionDifficulty.MEDIUM,
      QuestionDifficulty.MEDIUM,
      QuestionDifficulty.EASY,
      QuestionDifficulty.MEDIUM,
      QuestionDifficulty.HARD,
    ];
    const rank = (item: (typeof questions)[number]) =>
      Number(!weakTopicIds.has(item.topicId)) * 4 +
      Number(item.sourceType !== QuestionSourceType.PYQ) * 2;
    const ordered = [...questions].sort(
      (left, right) => rank(left) - rank(right) || left.id.localeCompare(right.id),
    );
    const picked: (typeof questions)[number][] = [];
    for (const difficulty of difficultyOrder) {
      const next = ordered.find(
        (item) => item.difficulty === difficulty && !picked.some((pickedItem) => pickedItem.id === item.id),
      );
      if (next) picked.push(next);
    }
    for (const item of ordered) {
      if (picked.length >= this.targets.questions) break;
      if (!picked.some((pickedItem) => pickedItem.id === item.id)) picked.push(item);
    }
    return picked
      .slice(0, this.targets.questions)
      .map((item) => ({ ...item, type: DailyStudyTaskType.QUESTION }));
  }

  protected revisionPriority(_type: RevisionType): number {
    return 0;
  }

  protected async weakPhysicsAreas(studentId: string, subjectId: string) {
    const [practice, attempts] = await Promise.all([
      this.db.questionPracticeItem.findMany({
        where: {
          isCorrect: false,
          session: { is: { studentId } },
          question: { is: { subjectId } },
        },
        select: { question: { select: { id: true, topicId: true } } },
      }),
      this.db.testAttemptAnswer.findMany({
        where: {
          isCorrect: false,
          attempt: { is: { studentId } },
          testQuestion: { is: { question: { is: { subjectId } } } },
        },
        select: { testQuestion: { select: { question: { select: { topicId: true } } } } },
      }),
    ]);
    return new Set([
      ...practice.map((item) => item.question.topicId),
      ...attempts.map((item) => item.testQuestion.question.topicId),
    ]);
  }

  protected contentVisibility() {
    return {
      isActive: true,
      isPublished: true,
      AND: [
        { exam: { is: visible } },
        { subject: { is: { ...visible, exam: { is: visible } } } },
        { academicClass: { is: { ...visible, subject: { is: { ...visible, exam: { is: visible } } } } } },
        { chapter: { is: { ...visible, academicClass: { is: { ...visible, subject: { is: { ...visible, exam: { is: visible } } } } } } } },
        { topic: { is: { ...visible, chapter: { is: { ...visible, academicClass: { is: { ...visible, subject: { is: { ...visible, exam: { is: visible } } } } } } } } } },
        { OR: [{ subtopicId: null }, { subtopic: { is: { ...visible } } }] },
      ],
    };
  }
}
