import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { AdminSubscriptionListQueryDto } from './subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';

type AuthenticatedRequest = { user: { id: string } };

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user\'s current subscription state' })
  getMine(@Req() request: AuthenticatedRequest) {
    return this.subscriptions.getCurrentForUser(request.user.id);
  }
}

@ApiTags('admin subscriptions')
@ApiBearerAuth()
@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
export class AdminSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'List subscriptions for administrators' })
  list(@Query() query: AdminSubscriptionListQueryDto) {
    return this.subscriptions.listAdmin(query);
  }

  @Get(':subscriptionId')
  @ApiOperation({ summary: 'Get a subscription for administrators' })
  get(@Param('subscriptionId') subscriptionId: string) {
    return this.subscriptions.getAdmin(subscriptionId);
  }
}
