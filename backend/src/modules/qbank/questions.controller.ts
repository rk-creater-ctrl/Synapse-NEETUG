import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContentManagementRoles } from '../../shared/decorators/content-management-roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import {
  AdminQuestionListDto,
  QuestionDto,
  UpdateQuestionDto,
} from './questions.dto';
import { QuestionsService } from './questions.service';

@ApiTags('admin questions')
@ApiBearerAuth()
@Controller('admin/questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ContentManagementRoles()
export class AdminQuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  @ApiOperation({ summary: 'List CMS questions with options and PYQ metadata' })
  list(@Query() query: AdminQuestionListDto) {
    return this.questions.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a CMS question with answer and source metadata' })
  get(@Param('id') id: string) {
    return this.questions.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a question with four options and optional PYQ metadata' })
  create(@Body() dto: QuestionDto) {
    return this.questions.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a question, its options, and PYQ metadata atomically' })
  update(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questions.update(id, dto);
  }
}
