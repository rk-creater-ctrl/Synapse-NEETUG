import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { AuthModule } from '../identity/auth/auth.module';
import { CommunityController } from './community.controller';
import { CommunityGateway } from './community.gateway';
import { CommunityMessagesService } from './community-messages.service';
import { CommunityService } from './community.service';

@Module({
  imports: [AuthModule],
  controllers: [CommunityController],
  providers: [CommunityService, CommunityMessagesService, CommunityGateway, PrismaService],
})
export class CommunityModule {}
