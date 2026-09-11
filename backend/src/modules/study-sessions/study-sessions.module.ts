import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { StudySessionsController } from './study-sessions.controller';
import { StudySessionsService } from './study-sessions.service';

@Module({
  controllers: [StudySessionsController],
  providers: [StudySessionsService, PrismaService],
  exports: [StudySessionsService],
})
export class StudySessionsModule {}
