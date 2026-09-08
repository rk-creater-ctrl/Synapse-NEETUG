import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

export type ContentHierarchy = {
  examId?: string;
  subjectId?: string;
  academicClassId?: string;
  chapterId?: string;
  topicId?: string;
  subtopicId?: string | null;
};

@Injectable()
export class ContentHierarchyService {
  constructor(private readonly db: PrismaService) {}

  private invalid(message: string): never {
    throw new BadRequestException({
      code: 'INVALID_CONTENT_HIERARCHY',
      message,
    });
  }

  async validate(hierarchy: ContentHierarchy): Promise<void> {
    const { examId, subjectId, academicClassId, chapterId, topicId, subtopicId } = hierarchy;
    if (!examId || !subjectId || !academicClassId || !chapterId || !topicId) {
      this.invalid('Exam, subject, class, chapter, and topic are required.');
    }

    const subject = await this.db.subject.findUnique({
      where: { id: subjectId },
      select: { examId: true },
    });
    if (!subject || subject.examId !== examId) {
      this.invalid('Subject does not belong to the selected exam.');
    }

    const academicClass = await this.db.academicClass.findUnique({
      where: { id: academicClassId },
      select: { subjectId: true },
    });
    if (!academicClass || academicClass.subjectId !== subjectId) {
      this.invalid('Class does not belong to the selected subject.');
    }

    const chapter = await this.db.chapter.findUnique({
      where: { id: chapterId },
      select: { classId: true },
    });
    if (!chapter || chapter.classId !== academicClassId) {
      this.invalid('Chapter does not belong to the selected class.');
    }

    const topic = await this.db.topic.findUnique({
      where: { id: topicId },
      select: { chapterId: true },
    });
    if (!topic || topic.chapterId !== chapterId) {
      this.invalid('Topic does not belong to the selected chapter.');
    }

    if (subtopicId) {
      const subtopic = await this.db.subtopic.findUnique({
        where: { id: subtopicId },
        select: { topicId: true },
      });
      if (!subtopic || subtopic.topicId !== topicId) {
        this.invalid('Subtopic does not belong to the selected topic.');
      }
    }
  }
}
