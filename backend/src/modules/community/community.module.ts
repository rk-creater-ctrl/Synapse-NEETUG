import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';

@Module({
  controllers: [CommunityController],
  providers: [CommunityService, PrismaService],
})
export class CommunityModule {}
