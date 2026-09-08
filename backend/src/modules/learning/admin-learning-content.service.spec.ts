import { BadRequestException } from '@nestjs/common';
import {
  AdminRevisionListDto,
  AdminVideoListDto,
  UpdateVideoDto,
  VideoDto,
} from './dto';
import { AdminLearningContentService } from './admin-learning-content.service';

describe('AdminLearningContentService', () => {
  const db = {
    $transaction: jest.fn(),
    video: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    revisionItem: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const hierarchy = { validate: jest.fn() };
  const mediaAssets = { assertActiveForAssignment: jest.fn().mockResolvedValue(undefined) };
  let service: AdminLearningContentService;

  const video: VideoDto = {
    title: 'Units introduction',
    slug: 'units-introduction',
    examId: 'exam-1',
    subjectId: 'subject-1',
    academicClassId: 'class-1',
    chapterId: 'chapter-1',
    topicId: 'topic-1',
    providerAssetId: 'asset-1',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AdminLearningContentService(db as never, hierarchy as never, mediaAssets as never);
    hierarchy.validate.mockResolvedValue(undefined);
    db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    db.video.findMany.mockResolvedValue([{ id: 'video-1' }]);
    db.video.count.mockResolvedValue(21);
    db.revisionItem.findMany.mockResolvedValue([{ id: 'revision-1' }]);
    db.revisionItem.count.mockResolvedValue(1);
  });

  it('returns the standard paginated video contract with deterministic paging', async () => {
    const query = Object.assign(new AdminVideoListDto(), {
      page: 2,
      limit: 10,
      search: 'units',
      subjectId: 'subject-1',
      isPublished: true,
      isActive: false,
      isPremium: true,
    });

    await expect(service.videos(query)).resolves.toEqual({
      items: [{ id: 'video-1' }],
      meta: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
    expect(db.video.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          subjectId: 'subject-1',
          isPublished: true,
          isActive: false,
          isFree: false,
        }),
      }),
    );
  });

  it('applies revision hierarchy and type filters without changing student APIs', async () => {
    const query = Object.assign(new AdminRevisionListDto(), {
      classId: 'class-1',
      chapterId: 'chapter-1',
      topicId: 'topic-1',
      type: 'FORMULA',
    });

    await service.revision(query);
    expect(db.revisionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicClassId: 'class-1',
          chapterId: 'chapter-1',
          topicId: 'topic-1',
          type: 'FORMULA',
        }),
      }),
    );
  });

  it('does not write a video when hierarchy validation rejects the request', async () => {
    hierarchy.validate.mockRejectedValue(
      new BadRequestException({ code: 'INVALID_CONTENT_HIERARCHY' }),
    );

    await expect(service.createVideo(video)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.video.create).not.toHaveBeenCalled();
  });

  it('validates the effective hierarchy for a partial video update', async () => {
    db.video.findUnique.mockResolvedValue({ id: 'video-1', ...video });
    db.video.update.mockResolvedValue({ id: 'video-1', ...video });
    const update = Object.assign(new UpdateVideoDto(), { title: 'Updated title' });

    await service.updateVideo('video-1', update);

    expect(hierarchy.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        subjectId: 'subject-1',
        academicClassId: 'class-1',
        chapterId: 'chapter-1',
        topicId: 'topic-1',
      }),
    );
    expect(db.video.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Updated title' } }),
    );
    expect(mediaAssets.assertActiveForAssignment).not.toHaveBeenCalled();
  });

  it('allows a video without a media asset and validates a supplied assignment', async () => {
    db.video.create.mockResolvedValue({ id: 'video-1', ...video });
    await service.createVideo(video);
    expect(mediaAssets.assertActiveForAssignment).toHaveBeenCalledWith(undefined);

    mediaAssets.assertActiveForAssignment.mockRejectedValueOnce(
      new BadRequestException({ code: 'INACTIVE_MEDIA_ASSET' }),
    );
    await expect(service.createVideo({ ...video, mediaAssetId: 'inactive-asset' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves an omitted video media asset and permits explicit clearing', async () => {
    db.video.findUnique.mockResolvedValue({ id: 'video-1', ...video, mediaAssetId: 'asset-1' });
    db.video.update.mockResolvedValue({ id: 'video-1', mediaAssetId: 'asset-1' });

    await service.updateVideo('video-1', Object.assign(new UpdateVideoDto(), { title: 'New title' }));
    expect(mediaAssets.assertActiveForAssignment).not.toHaveBeenCalled();

    await service.updateVideo('video-1', Object.assign(new UpdateVideoDto(), { mediaAssetId: null }));
    expect(mediaAssets.assertActiveForAssignment).toHaveBeenCalledWith(null);
    expect(db.video.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { mediaAssetId: null } }));
  });
});
