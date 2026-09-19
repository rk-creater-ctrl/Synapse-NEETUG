import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { PlansController, AdminPlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  controllers: [PlansController, AdminPlansController],
  providers: [PlansService, PrismaService],
})
export class PlansModule {}
