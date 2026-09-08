import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ContentManagementRoles } from '../../shared/decorators/content-management-roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { AdminLearningContentService } from './admin-learning-content.service';
import {
  AdminRevisionListDto,
  AdminVideoListDto,
  LearningFilterDto,
  ProgressDto,
  RevisionDto,
  UpdateRevisionDto,
  UpdateVideoDto,
  VideoDto,
} from './dto';
import { LearningService } from './learning.service';

type AuthenticatedUser = { id: string };

@Controller('learning')
@UseGuards(JwtAuthGuard)
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('videos')
  videos(@Query() filters: LearningFilterDto) {
    return this.learning.videos(filters);
  }

  @Get('videos/:id/playback')
  playback(@Param('id') id: string) {
    return this.learning.playback(id);
  }

  @Get('videos/:id/progress')
  progress(@Req() request: { user: AuthenticatedUser }, @Param('id') id: string) {
    return this.learning.progress(request.user.id, id);
  }

  @Put('videos/:id/progress')
  updateProgress(
    @Req() request: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: ProgressDto,
  ) {
    return this.learning.updateProgress(request.user.id, id, dto);
  }

  @Get('videos/:id')
  video(@Param('id') id: string) {
    return this.learning.video(id);
  }

  @Get('chapters/:id')
  chapter(@Param('id') id: string) {
    return this.learning.chapter(id);
  }

  @Get('continue')
  continueLearning(@Req() request: { user: AuthenticatedUser }) {
    return this.learning.cont(request.user.id);
  }

  @Get('revision')
  revision(@Query() filters: LearningFilterDto) {
    return this.learning.revision(filters);
  }

  @Get('revision/:id')
  revisionById(@Param('id') id: string) {
    return this.learning.revisionById(id);
  }
}

@Controller('admin/learning')
@UseGuards(JwtAuthGuard, RolesGuard)
@ContentManagementRoles()
export class AdminLearningController {
  constructor(private readonly content: AdminLearningContentService) {}

  @Get('videos')
  videos(@Query() query: AdminVideoListDto) {
    return this.content.videos(query);
  }

  @Post('videos')
  createVideo(@Body() dto: VideoDto) {
    return this.content.createVideo(dto);
  }

  @Patch('videos/:id')
  updateVideo(@Param('id') id: string, @Body() dto: UpdateVideoDto) {
    return this.content.updateVideo(id, dto);
  }

  @Get('revision')
  revision(@Query() query: AdminRevisionListDto) {
    return this.content.revision(query);
  }

  @Post('revision')
  createRevision(@Body() dto: RevisionDto) {
    return this.content.createRevision(dto);
  }

  @Patch('revision/:id')
  updateRevision(@Param('id') id: string, @Body() dto: UpdateRevisionDto) {
    return this.content.updateRevision(id, dto);
  }
}
