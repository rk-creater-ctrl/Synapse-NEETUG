import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MediaAssetsController } from './media-assets.controller';
import { MediaAssetsService } from './media-assets.service';

@Module({
  controllers: [MediaAssetsController],
  providers: [MediaAssetsService, PrismaService, RolesGuard],
  exports: [MediaAssetsService],
})
export class MediaAssetsModule {}
