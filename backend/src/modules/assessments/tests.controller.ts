import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentManagementRoles } from '../../shared/decorators/content-management-roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import {
  AdminTestListQueryDto,
  CreateTestDto,
  UpdateTestDto,
} from './tests.dto';
import { TestsService } from './tests.service';

@Controller('admin/tests')
@UseGuards(JwtAuthGuard, RolesGuard)
@ContentManagementRoles()
export class TestsController {
  constructor(private readonly tests: TestsService) {}

  @Get()
  list(@Query() query: AdminTestListQueryDto) {
    return this.tests.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tests.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTestDto) {
    return this.tests.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTestDto) {
    return this.tests.update(id, dto);
  }
}
