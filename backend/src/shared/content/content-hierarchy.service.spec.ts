import { BadRequestException } from '@nestjs/common';
import { ContentHierarchyService } from './content-hierarchy.service';

describe('ContentHierarchyService', () => {
  const hierarchy = {
    examId: 'exam-1',
    subjectId: 'subject-1',
    academicClassId: 'class-1',
    chapterId: 'chapter-1',
    topicId: 'topic-1',
    subtopicId: 'subtopic-1',
  };

  const db = {
    subject: { findUnique: jest.fn() },
    academicClass: { findUnique: jest.fn() },
    chapter: { findUnique: jest.fn() },
    topic: { findUnique: jest.fn() },
    subtopic: { findUnique: jest.fn() },
  };

  let service: ContentHierarchyService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ContentHierarchyService(db as never);
    db.subject.findUnique.mockResolvedValue({ examId: hierarchy.examId });
    db.academicClass.findUnique.mockResolvedValue({
      subjectId: hierarchy.subjectId,
    });
    db.chapter.findUnique.mockResolvedValue({ classId: hierarchy.academicClassId });
    db.topic.findUnique.mockResolvedValue({ chapterId: hierarchy.chapterId });
    db.subtopic.findUnique.mockResolvedValue({ topicId: hierarchy.topicId });
  });

  it('accepts a complete, consistent hierarchy chain', async () => {
    await expect(service.validate(hierarchy)).resolves.toBeUndefined();
  });

  it('rejects a subject assigned to another exam', async () => {
    db.subject.findUnique.mockResolvedValue({ examId: 'another-exam' });

    await expect(service.validate(hierarchy)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a topic assigned to another chapter', async () => {
    db.topic.findUnique.mockResolvedValue({ chapterId: 'another-chapter' });

    await expect(service.validate(hierarchy)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_CONTENT_HIERARCHY' }),
    });
  });

  it('rejects an incomplete content hierarchy', async () => {
    await expect(
      service.validate({ ...hierarchy, topicId: undefined }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_CONTENT_HIERARCHY' }),
    });
  });
});
