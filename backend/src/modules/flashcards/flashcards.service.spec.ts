import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FlashcardReviewResult } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FlashcardFilterDto } from './flashcards.dto';
import { FlashcardsService } from './flashcards.service';

describe('FlashcardsService', () => {
  const db: any = {
    flashcard: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    flashcardProgress: { upsert: jest.fn() },
  };
  const service = new FlashcardsService(db);
  const freeCard = { id: 'card-1', isActive: true, isPublished: true, isPremium: false };

  beforeEach(() => jest.clearAllMocks());

  it('lists only active, published cards and maps classId to academicClassId', async () => {
    db.flashcard.findMany.mockResolvedValue([]);
    await service.list({ classId: 'class-11', topicId: 'topic-1' });
    expect(db.flashcard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true, isPublished: true, academicClassId: 'class-11', topicId: 'topic-1' }) }));
  });

  it('hides missing, draft, and inactive cards from students', async () => {
    db.flashcard.findFirst.mockResolvedValue(null);
    await expect(service.one('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.flashcard.findFirst).toHaveBeenLastCalledWith({ where: { id: 'missing', isActive: true, isPublished: true } });
  });

  it('denies premium cards and returns free cards', async () => {
    db.flashcard.findFirst.mockResolvedValueOnce({ ...freeCard, isPremium: true });
    await expect(service.one('premium')).rejects.toBeInstanceOf(ForbiddenException);
    db.flashcard.findFirst.mockResolvedValueOnce(freeCard);
    await expect(service.one('card-1')).resolves.toEqual(freeCard);
  });

  it('bounds sessions to the requested validated limit and excludes draft/inactive cards', async () => {
    db.flashcard.findMany.mockResolvedValue([]);
    await service.session({ limit: 100, chapterId: 'chapter-1' });
    expect(db.flashcard.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, where: expect.objectContaining({ isActive: true, isPublished: true, chapterId: 'chapter-1' }) }));
  });

  it('rejects session limits above the safe DTO maximum', async () => {
    const errors = await validate(plainToInstance(FlashcardFilterDto, { limit: '101' }));
    expect(errors).not.toHaveLength(0);
  });

  it('uses authenticated identity and safely upserts repeated reviews', async () => {
    db.flashcard.findFirst.mockResolvedValue(freeCard);
    db.flashcardProgress.upsert.mockResolvedValue({ reviewCount: 1 });
    await service.review('student-a', 'card-1', { result: FlashcardReviewResult.GOOD });
    await service.review('student-a', 'card-1', { result: FlashcardReviewResult.EASY });
    expect(db.flashcardProgress.upsert).toHaveBeenCalledTimes(2);
    expect(db.flashcardProgress.upsert.mock.calls[1][0]).toEqual(expect.objectContaining({ where: { studentId_flashcardId: { studentId: 'student-a', flashcardId: 'card-1' } }, update: expect.objectContaining({ reviewCount: { increment: 1 }, lastResult: FlashcardReviewResult.EASY }) }));
  });

  it('creates and updates flashcards through the admin service', async () => {
    const dto: any = { examId: 'exam', subjectId: 'subject', academicClassId: 'class', chapterId: 'chapter', topicId: 'topic', frontContent: 'Front', backContent: 'Back', sortOrder: 1 };
    db.flashcard.create.mockResolvedValue({ id: 'created' }); db.flashcard.update.mockResolvedValue({ id: 'created', sortOrder: 2 });
    await service.create(dto); await service.update('created', { sortOrder: 2 });
    expect(db.flashcard.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ academicClassId: 'class', topicId: 'topic' }) }));
    expect(db.flashcard.update).toHaveBeenCalledWith({ where: { id: 'created' }, data: { sortOrder: 2 } });
  });
});
