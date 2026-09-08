import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FlashcardReviewResult } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FlashcardFilterDto } from './flashcards.dto';
import { FlashcardsService } from './flashcards.service';

describe('FlashcardsService', () => {
  const db: any = {
    flashcard: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    flashcardProgress: { upsert: jest.fn() },
  };
  const hierarchy = { validate: jest.fn().mockResolvedValue(undefined) };
  const mediaAssets = { assertActiveForAssignment: jest.fn().mockResolvedValue(undefined) };
  const service = new FlashcardsService(db, hierarchy as never, mediaAssets as never);
  const freeCard = { id: 'card-1', isActive: true, isPublished: true, isPremium: false };

  beforeEach(() => jest.clearAllMocks());

  it('lists only active, published, free cards and maps classId to academicClassId', async () => {
    db.flashcard.findMany.mockResolvedValue([]);
    await service.list({ classId: 'class-11', topicId: 'topic-1' });
    expect(db.flashcard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true, isPublished: true, isPremium: false, academicClassId: 'class-11', topicId: 'topic-1' }) }));
  });

  it('adds hierarchy visibility requirements to student flashcard reads', async () => {
    db.flashcard.findMany.mockResolvedValue([]);

    await service.list({ topicId: 'topic-1' });

    expect(db.flashcard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          topicId: 'topic-1',
          isActive: true,
          isPublished: true,
          isPremium: false,
          AND: expect.any(Array),
        }),
      }),
    );
  });

  it('hides missing, draft, and inactive cards from students', async () => {
    db.flashcard.findFirst.mockResolvedValue(null);
    await expect(service.one('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.flashcard.findFirst).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        id: 'missing',
        isActive: true,
        isPublished: true,
        AND: expect.any(Array),
      }),
    });
  });

  it('denies premium cards and returns free cards', async () => {
    db.flashcard.findFirst.mockResolvedValueOnce({ ...freeCard, isPremium: true });
    await expect(service.one('premium')).rejects.toBeInstanceOf(ForbiddenException);
    db.flashcard.findFirst.mockResolvedValueOnce(freeCard);
    await expect(service.one('card-1')).resolves.toEqual(freeCard);
  });

  it('bounds sessions to the requested validated limit and excludes draft, inactive, and premium cards', async () => {
    db.flashcard.findMany.mockResolvedValue([]);
    await service.session({ limit: 100, chapterId: 'chapter-1' });
    expect(db.flashcard.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, where: expect.objectContaining({ isActive: true, isPublished: true, isPremium: false, chapterId: 'chapter-1' }) }));
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
    db.flashcard.findUnique.mockResolvedValue({ id: 'created', ...dto, subtopicId: null });
    await service.create(dto); await service.update('created', { sortOrder: 2 });
    expect(mediaAssets.assertActiveForAssignment).toHaveBeenCalledWith(undefined);
    expect(db.flashcard.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ academicClassId: 'class', topicId: 'topic' }) }));
    expect(db.flashcard.update).toHaveBeenCalledWith({ where: { id: 'created' }, data: { sortOrder: 2 } });
  });

  it('preserves an existing media asset when an update omits mediaAssetId', async () => {
    db.flashcard.findUnique.mockResolvedValue({
      id: 'card-1',
      examId: 'exam', subjectId: 'subject', academicClassId: 'class', chapterId: 'chapter', topicId: 'topic',
      mediaAssetId: 'asset-1', subtopicId: null,
    });
    db.flashcard.update.mockResolvedValue({ id: 'card-1', mediaAssetId: 'asset-1' });

    await service.update('card-1', { title: 'Updated title' });

    expect(mediaAssets.assertActiveForAssignment).not.toHaveBeenCalled();
    expect(db.flashcard.update).toHaveBeenCalledWith({ where: { id: 'card-1' }, data: { title: 'Updated title' } });
  });

  it('allows an explicit media asset reference to be cleared', async () => {
    db.flashcard.findUnique.mockResolvedValue({
      id: 'card-1',
      examId: 'exam', subjectId: 'subject', academicClassId: 'class', chapterId: 'chapter', topicId: 'topic',
      mediaAssetId: 'asset-1', subtopicId: null,
    });
    db.flashcard.update.mockResolvedValue({ id: 'card-1', mediaAssetId: null });

    await service.update('card-1', { mediaAssetId: null });

    expect(mediaAssets.assertActiveForAssignment).toHaveBeenCalledWith(null);
    expect(db.flashcard.update).toHaveBeenCalledWith({ where: { id: 'card-1' }, data: { mediaAssetId: null } });
  });
});
