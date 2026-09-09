import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ContentHierarchyService } from '../../shared/content/content-hierarchy.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MediaAssetsModule } from '../media-assets/media-assets.module';
import { AdminQuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { StudentQuestionsController } from './student-questions.controller';
import { StudentQuestionsService } from './student-questions.service';
import { QuestionPracticeSessionsController } from './practice-sessions.controller';
import { QuestionPracticeSessionsService } from './practice-sessions.service';

@Module({
  imports: [MediaAssetsModule],
  controllers: [
    AdminQuestionsController,
    StudentQuestionsController,
    QuestionPracticeSessionsController,
  ],
  providers: [
    QuestionsService,
    StudentQuestionsService,
    QuestionPracticeSessionsService,
    ContentHierarchyService,
    PrismaService,
    RolesGuard,
  ],
})
export class QuestionsModule {}
