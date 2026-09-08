import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ContentHierarchyService } from '../../shared/content/content-hierarchy.service';
import { AdminLearningContentService } from './admin-learning-content.service';
import { AdminLearningController, LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { LocalVideoProvider } from './videos/providers/local-video.provider';
import { VideoProviderService } from './videos/providers/video-provider.service';
import { MediaAssetsModule } from '../media-assets/media-assets.module';

@Module({
  imports: [MediaAssetsModule],
  controllers: [LearningController, AdminLearningController],
  providers: [
    LearningService,
    AdminLearningContentService,
    PrismaService,
    ContentHierarchyService,
    VideoProviderService,
    LocalVideoProvider,
  ],
})
export class LearningModule {}
