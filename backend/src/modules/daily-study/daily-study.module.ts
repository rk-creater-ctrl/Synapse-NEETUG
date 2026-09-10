import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { DailyStudyService } from './daily-study.service';
import { PhysicsDailyStudyStrategy } from './physics-daily-study.strategy';
import { ChemistryDailyStudyStrategy } from './chemistry-daily-study.strategy';
import { BiologyDailyStudyStrategy } from './biology-daily-study.strategy';
import { DailyStudyController } from './daily-study.controller';

@Module({
  controllers: [DailyStudyController],
  providers: [
    DailyStudyService,
    PhysicsDailyStudyStrategy,
    ChemistryDailyStudyStrategy,
    BiologyDailyStudyStrategy,
    PrismaService,
  ],
  exports: [DailyStudyService],
})
export class DailyStudyModule {}
