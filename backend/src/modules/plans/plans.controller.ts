import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import {
  AdminSubscriptionPlanListDto,
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
} from './plans.dto';
import { PlansService } from './plans.service';

@ApiTags('plans')
@ApiBearerAuth()
@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'List active published subscription plans' })
  catalog() {
    return this.plans.catalog();
  }
}

@ApiTags('admin plans')
@ApiBearerAuth()
@Controller('admin/plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
export class AdminPlansController {
  constructor(private readonly plans: PlansService) {}

  @Post()
  @ApiOperation({ summary: 'Create a provider-agnostic subscription plan' })
  create(@Body() dto: CreateSubscriptionPlanDto) {
    return this.plans.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all subscription plans for administrators' })
  list(@Query() query: AdminSubscriptionPlanListDto) {
    return this.plans.listAdmin(query);
  }

  @Get(':planId')
  @ApiOperation({ summary: 'Get a subscription plan for administrators' })
  get(@Param('planId') planId: string) {
    return this.plans.getAdmin(planId);
  }

  @Patch(':planId')
  @ApiOperation({ summary: 'Update plan catalog fields without changing its stable code' })
  update(@Param('planId') planId: string, @Body() dto: UpdateSubscriptionPlanDto) {
    return this.plans.update(planId, dto);
  }
}
