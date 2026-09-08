import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ContentHierarchyService } from '../../shared/content/content-hierarchy.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MediaAssetsModule } from '../media-assets/media-assets.module';
import { FlashcardsController, AdminFlashcardsController } from './flashcards.controller';
import { FlashcardsService } from './flashcards.service';

@Module({
  imports: [MediaAssetsModule],
  controllers: [FlashcardsController, AdminFlashcardsController],
  providers: [FlashcardsService, ContentHierarchyService, PrismaService, RolesGuard],
})
export class FlashcardsModule {}
