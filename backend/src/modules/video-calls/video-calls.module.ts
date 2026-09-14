import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DailyVideoProviderService } from './daily-video-provider.service';
import { DisabledVideoProviderService } from './disabled-video-provider.service';
import { VIDEO_FETCH, VIDEO_PROVIDER } from './video-provider.token';

@Module({
  providers: [
    DailyVideoProviderService,
    DisabledVideoProviderService,
    { provide: VIDEO_FETCH, useFactory: () => globalThis.fetch.bind(globalThis) },
    {
      provide: VIDEO_PROVIDER,
      inject: [ConfigService, DailyVideoProviderService, DisabledVideoProviderService],
      useFactory: (config: ConfigService, daily: DailyVideoProviderService, disabled: DisabledVideoProviderService) =>
        config.get<string>('VIDEO_PROVIDER') === 'daily' ? daily : disabled,
    },
  ],
  exports: [VIDEO_PROVIDER],
})
export class VideoCallsModule {}
