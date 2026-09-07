import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { PrismaService } from './core/database/prisma.service';
import { HealthController } from './health.controller';
import { AcademicsModule } from './modules/academics/academics.module';
import { AuthModule } from './modules/identity/auth/auth.module';
import { LearningModule } from './modules/learning/learning.module';
import { FlashcardsModule } from './modules/flashcards/flashcards.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
        PORT: Joi.number().default(3000),
        CORS_ORIGINS: Joi.string().allow(''),
      }),
    }),
    // Global safety net; sensitive auth routes use stricter per-route limits.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    AcademicsModule,
    LearningModule,
    FlashcardsModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
