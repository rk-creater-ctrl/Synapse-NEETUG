import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { StudyLeaderboardController } from './study-leaderboard.controller';
import { StudyLeaderboardService } from './study-leaderboard.service';

@Module({
  controllers: [StudyLeaderboardController],
  providers: [StudyLeaderboardService, PrismaService],
})
export class StudyLeaderboardModule {}
