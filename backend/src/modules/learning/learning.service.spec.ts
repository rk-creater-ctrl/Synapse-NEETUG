import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import { LearningService } from "./learning.service";

describe("LearningService", () => {
  let service: LearningService;

  const db = {
    video: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    videoProgress: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    chapter: {
      findUnique: jest.fn(),
    },
    revisionItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const providers = {
    getPlaybackAccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new LearningService(db as any, providers as any);
  });

  describe("videos", () => {
    it("only returns active and published videos for students", async () => {
      db.video.findMany.mockResolvedValue([]);

      await service.videos({
        subjectId: "subject-1",
      });

      expect(db.video.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          isPublished: true,
          subjectId: "subject-1",
        },
        orderBy: {
          displayOrder: "asc",
        },
      });
    });

    it("maps classId filter to academicClassId", async () => {
      db.video.findMany.mockResolvedValue([]);

      await service.videos({
        classId: "class-11",
      });

      expect(db.video.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          isPublished: true,
          academicClassId: "class-11",
        },
        orderBy: {
          displayOrder: "asc",
        },
      });
    });
  });

  describe("video", () => {
    it("throws NotFoundException when video is unavailable", async () => {
      db.video.findFirst.mockResolvedValue(null);

      await expect(service.video("missing-video")).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(db.video.findFirst).toHaveBeenCalledWith({
        where: {
          id: "missing-video",
          isActive: true,
          isPublished: true,
        },
      });
    });
  });

  describe("playback", () => {
    it("blocks premium videos without access", async () => {
      db.video.findFirst.mockResolvedValue({
        id: "premium-video",
        isActive: true,
        isPublished: true,
        isFree: false,
      });

      await expect(service.playback("premium-video")).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(providers.getPlaybackAccess).not.toHaveBeenCalled();
    });

    it("returns provider playback access for free videos", async () => {
      const video = {
        id: "free-video",
        isActive: true,
        isPublished: true,
        isFree: true,
        provider: "LOCAL",
      };

      const playback = {
        videoId: "free-video",
        provider: "LOCAL",
        playbackUrl: "https://example.com/video.mp4",
        expiresAt: null,
      };

      db.video.findFirst.mockResolvedValue(video);
      providers.getPlaybackAccess.mockResolvedValue(playback);

      await expect(service.playback("free-video")).resolves.toEqual(playback);

      expect(providers.getPlaybackAccess).toHaveBeenCalledWith(video);
    });
  });

  describe("updateProgress", () => {
    it("marks progress completed at 90 percent", async () => {
      db.video.findFirst.mockResolvedValue({
        id: "video-1",
        isActive: true,
        isPublished: true,
        durationSeconds: 600,
      });

      db.videoProgress.upsert.mockImplementation(async (args: any) => ({
        id: "progress-1",
        ...args.create,
      }));

      const result = await service.updateProgress("student-1", "video-1", {
        lastPositionSeconds: 540,
        watchedSeconds: 500,
      });

      expect(result.completionPercentage).toBe(90);
      expect(result.completed).toBe(true);

      expect(db.videoProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            studentId_videoId: {
              studentId: "student-1",
              videoId: "video-1",
            },
          },
          create: expect.objectContaining({
            completionPercentage: 90,
            completed: true,
          }),
          update: expect.objectContaining({
            completionPercentage: 90,
            completed: true,
          }),
        }),
      );
    });

    it("does not mark progress completed below 90 percent", async () => {
      db.video.findFirst.mockResolvedValue({
        id: "video-1",
        isActive: true,
        isPublished: true,
        durationSeconds: 600,
      });

      db.videoProgress.upsert.mockImplementation(async (args: any) => ({
        id: "progress-1",
        ...args.create,
      }));

      const result = await service.updateProgress("student-1", "video-1", {
        lastPositionSeconds: 300,
        watchedSeconds: 280,
      });

      expect(result.completionPercentage).toBe(50);
      expect(result.completed).toBe(false);
    });

    it("rejects progress greater than video duration", async () => {
      db.video.findFirst.mockResolvedValue({
        id: "video-1",
        isActive: true,
        isPublished: true,
        durationSeconds: 600,
      });

      await expect(
        service.updateProgress("student-1", "video-1", {
          lastPositionSeconds: 601,
          watchedSeconds: 100,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(db.videoProgress.upsert).not.toHaveBeenCalled();
    });
  });

  describe("revisionById", () => {
    it("throws when revision item is not active and published", async () => {
      db.revisionItem.findFirst.mockResolvedValue(null);

      await expect(
        service.revisionById("missing-revision"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("chapter", () => {
    it("throws when chapter does not exist", async () => {
      db.chapter.findUnique.mockResolvedValue(null);

      await expect(service.chapter("missing-chapter")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
