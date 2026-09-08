import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { LearningFilterDto, ProgressDto, RevisionDto, VideoDto } from './dto';
import { VideoProviderService } from './videos/providers/video-provider.service';

const visible = { isActive: true, isPublished: true };

@Injectable()
export class LearningService {
  constructor(
    private readonly db: PrismaService,
    private readonly providers: VideoProviderService,
  ) {}

  async videos(filters: LearningFilterDto) {
    return this.db.video.findMany({
      where: this.videoWhere(filters),
      orderBy: { displayOrder: 'asc' },
    });
  }

  async video(id: string) {
    const video = await this.db.video.findFirst({
      where: this.videoWhere({ id } as LearningFilterDto),
    });
    if (!video) {
      throw new NotFoundException('Video not found');
    }
    return video;
  }

  async playback(id: string) {
    const video = await this.video(id);
    if (!video.isFree) {
      throw new ForbiddenException({
        code: 'PREMIUM_ACCESS_REQUIRED',
        message: 'This lesson requires premium access',
      });
    }
    return this.providers.getPlaybackAccess(video);
  }

  async progress(studentId: string, videoId: string) {
    await this.video(videoId);
    return this.db.videoProgress.findUnique({
      where: { studentId_videoId: { studentId, videoId } },
    });
  }

  async updateProgress(studentId: string, videoId: string, dto: ProgressDto) {
    const video = await this.video(videoId);
    if (
      video.durationSeconds &&
      (dto.lastPositionSeconds > video.durationSeconds ||
        dto.watchedSeconds > video.durationSeconds)
    ) {
      throw new BadRequestException('Progress exceeds video duration');
    }

    const completionPercentage = video.durationSeconds
      ? Math.min(100, (dto.lastPositionSeconds / video.durationSeconds) * 100)
      : 0;
    const completed = completionPercentage >= 90;
    const now = new Date();

    return this.db.videoProgress.upsert({
      where: { studentId_videoId: { studentId, videoId } },
      create: {
        studentId,
        videoId,
        ...dto,
        completionPercentage,
        completed,
        firstStartedAt: now,
        lastWatchedAt: now,
        completedAt: completed ? now : null,
      },
      update: {
        ...dto,
        completionPercentage,
        completed,
        lastWatchedAt: now,
        completedAt: completed ? now : null,
      },
    });
  }

  async chapter(id: string) {
    const chapter = await this.db.chapter.findFirst({
      where: { id, ...this.chapterVisibility() },
      include: {
        topics: {
          where: { ...visible },
          orderBy: { displayOrder: 'asc' },
          include: {
            _count: {
              select: {
                videos: { where: this.contentVisibility() },
                revisionItems: { where: this.contentVisibility() },
                flashcards: { where: this.contentVisibility() },
              },
            },
          },
        },
      },
    });
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }
    return chapter;
  }

  async cont(studentId: string) {
    return this.db.videoProgress.findMany({
      where: {
        studentId,
        completed: false,
        video: { is: this.videoWhere({}) },
      },
      include: { video: true },
      orderBy: { lastWatchedAt: 'desc' },
      take: 10,
    });
  }

  async revision(filters: LearningFilterDto) {
    return this.db.revisionItem.findMany({
      where: this.revisionWhere(filters),
      orderBy: { displayOrder: 'asc' },
    });
  }

  async revisionById(id: string) {
    const revision = await this.db.revisionItem.findFirst({
      where: this.revisionWhere({ id } as LearningFilterDto),
    });
    if (!revision) {
      throw new NotFoundException('Revision item not found');
    }
    return revision;
  }

  // Legacy admin methods remain for compatibility; normalized admin endpoints use
  // AdminLearningContentService and intentionally do not apply public visibility.
  adminVideos() {
    return this.db.video.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  createVideo(dto: VideoDto) {
    return this.db.video.create({
      data: {
        ...dto,
        academicClassId: dto.academicClassId,
        subjectId: dto.subjectId!,
        chapterId: dto.chapterId!,
        topicId: dto.topicId!,
      },
    });
  }

  updateVideo(id: string, dto: Partial<VideoDto>) {
    return this.db.video.update({ where: { id }, data: dto });
  }

  adminRevision() {
    return this.db.revisionItem.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  createRevision(dto: RevisionDto) {
    return this.db.revisionItem.create({
      data: {
        ...dto,
        academicClassId: dto.academicClassId,
        subjectId: dto.subjectId!,
        chapterId: dto.chapterId!,
        topicId: dto.topicId!,
      },
    });
  }

  updateRevision(id: string, dto: Partial<RevisionDto>) {
    return this.db.revisionItem.update({ where: { id }, data: dto });
  }

  private videoWhere(filters: LearningFilterDto): Prisma.VideoWhereInput {
    return this.publicContentWhere(filters) as Prisma.VideoWhereInput;
  }

  private revisionWhere(
    filters: LearningFilterDto,
  ): Prisma.RevisionItemWhereInput {
    return this.publicContentWhere(filters) as Prisma.RevisionItemWhereInput;
  }

  private publicContentWhere(filters: LearningFilterDto) {
    const where: Record<string, unknown> = {
      ...visible,
      ...this.contentVisibility(),
    };
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        where[key === 'classId' ? 'academicClassId' : key] = value;
      }
    }
    return where;
  }

  private contentVisibility() {
    return {
      AND: [
        { exam: { is: visible } },
        { subject: { is: { ...visible, exam: { is: visible } } } },
        {
          academicClass: {
            is: {
              ...visible,
              subject: { is: { ...visible, exam: { is: visible } } },
            },
          },
        },
        {
          chapter: {
            is: {
              ...visible,
              academicClass: {
                is: {
                  ...visible,
                  subject: { is: { ...visible, exam: { is: visible } } },
                },
              },
            },
          },
        },
        {
          topic: {
            is: {
              ...visible,
              chapter: {
                is: {
                  ...visible,
                  academicClass: {
                    is: {
                      ...visible,
                      subject: { is: { ...visible, exam: { is: visible } } },
                    },
                  },
                },
              },
            },
          },
        },
        {
          OR: [
            { subtopicId: null },
            {
              subtopic: {
                is: {
                  ...visible,
                  topic: {
                    is: {
                      ...visible,
                      chapter: {
                        is: {
                          ...visible,
                          academicClass: {
                            is: {
                              ...visible,
                              subject: {
                                is: { ...visible, exam: { is: visible } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    };
  }

  private chapterVisibility() {
    return {
      ...visible,
      academicClass: {
        is: {
          ...visible,
          subject: { is: { ...visible, exam: { is: visible } } },
        },
      },
    };
  }
}
