import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { CommunityController } from './community.controller';
import { CommunityMessagesService } from './community-messages.service';
import { CommunityService } from './community.service';

@Module({
  controllers: [CommunityController],
  providers: [CommunityService, CommunityMessagesService, PrismaService],
})
export class CommunityModule {}
