import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';
import { StudentTestsController } from './student-tests.controller';
import { StudentTestsService } from './student-tests.service';
import { TestAttemptsController } from './test-attempts.controller';
import { TestAttemptsService } from './test-attempts.service';
import { TestResultsController } from './test-results.controller';
import { TestResultsService } from './test-results.service';

@Module({
  controllers: [
    TestsController,
    StudentTestsController,
    TestAttemptsController,
    TestResultsController,
  ],
  providers: [
    PrismaService,
    TestsService,
    StudentTestsService,
    TestAttemptsService,
    TestResultsService,
  ],
  exports: [
    TestsService,
    StudentTestsService,
    TestAttemptsService,
    TestResultsService,
  ],
})
export class AssessmentsModule {}
