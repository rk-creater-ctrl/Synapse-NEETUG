import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MentorsController } from './mentors.controller';
import { MentorsService } from './mentors.service';

@Module({
  controllers: [MentorsController],
  providers: [MentorsService, PrismaService, RolesGuard],
})
export class MentorsModule {}
