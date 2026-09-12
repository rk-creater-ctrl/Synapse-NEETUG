import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { MentorsService } from './mentors.service';

type AuthenticatedRequest = { user: { id: string } };

@ApiTags('mentor profile')
@ApiBearerAuth()
@Controller('mentors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.MENTOR)
export class MentorSelfController {
  constructor(private readonly mentors: MentorsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated mentor profile' })
  getOwnProfile(@Req() request: AuthenticatedRequest) {
    return this.mentors.getOwnProfile(request.user.id);
  }
}
