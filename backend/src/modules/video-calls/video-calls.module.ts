import { Module } from '@nestjs/common';

import { AuthModule } from '../identity/auth/auth.module';
import { MentorsModule } from '../mentors/mentors.module';
import { VideoSignalingGateway } from './video-signaling.gateway';

@Module({
  imports: [AuthModule, MentorsModule],
  providers: [VideoSignalingGateway],
})
export class VideoCallsModule {}
