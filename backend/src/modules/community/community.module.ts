import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { AuthModule } from '../identity/auth/auth.module';
import { CommunityController } from './community.controller';
import { CommunityAttachmentStorageService } from './community-attachment-storage.service';
import { CommunityGateway } from './community.gateway';
import { CommunityMessageAttachmentsInterceptor } from './community-message-attachments.interceptor';
import { CommunityMessagesService } from './community-messages.service';
import { CommunityModerationService } from './community-moderation.service';
import { CommunityReactionsService } from './community-reactions.service';
import { CommunityService } from './community.service';

@Module({
  imports: [AuthModule],
  controllers: [CommunityController],
  providers: [
    CommunityService,
    CommunityMessagesService,
    CommunityModerationService,
    CommunityReactionsService,
    CommunityAttachmentStorageService,
    CommunityMessageAttachmentsInterceptor,
    CommunityGateway,
    PrismaService,
  ],
})
export class CommunityModule {}
