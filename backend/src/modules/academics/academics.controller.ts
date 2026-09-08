import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContentManagementRoles } from '../../shared/decorators/content-management-roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { AcademicsService } from './academics.service';
import { AcademicDto, ListDto } from './dto';

const resources = ['exams', 'subjects', 'classes', 'chapters', 'topics', 'subtopics'] as const;
type Resource = typeof resources[number];

@ApiTags('academics')
@Controller('academics')
export class AcademicsController {
  constructor(private service: AcademicsService) {}

  @Get(':resource')
  list(@Param('resource') resource: Resource, @Query() query: ListDto) {
    return this.service.list(resource, query);
  }

  @Get(':resource/:id')
  get(@Param('resource') resource: Resource, @Param('id') id: string) {
    return this.service.get(resource, id);
  }
}

@ApiTags('admin academics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ContentManagementRoles()
@Controller('admin/academics')
export class AdminAcademicsController {
  constructor(private service: AcademicsService) {}

  @Get(':resource')
  list(@Param('resource') resource: Resource, @Query() query: ListDto) {
    return this.service.list(resource, query, false);
  }

  @Post(':resource')
  create(@Param('resource') resource: Resource, @Body() dto: AcademicDto) {
    return this.service.create(resource, dto);
  }

  @Patch(':resource/:id')
  update(
    @Param('resource') resource: Resource,
    @Param('id') id: string,
    @Body() dto: Partial<AcademicDto>,
  ) {
    return this.service.update(resource, id, dto);
  }
}
