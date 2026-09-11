import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { StudyAnalyticsController } from './study-analytics.controller';
import { StudyAnalyticsService } from './study-analytics.service';

@Module({
  controllers: [StudyAnalyticsController],
  providers: [StudyAnalyticsService, PrismaService],
})
export class StudyAnalyticsModule {}
