import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ReplaceMentorAvailabilityDto } from './mentors.dto';
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

  @Get('me/availability')
  @ApiOperation({ summary: 'Get the authenticated mentor recurring weekly availability' })
  getOwnAvailability(@Req() request: AuthenticatedRequest) {
    return this.mentors.getOwnAvailability(request.user.id);
  }

  @Put('me/availability')
  @ApiOperation({ summary: 'Replace the authenticated mentor recurring weekly availability' })
  replaceOwnAvailability(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ReplaceMentorAvailabilityDto,
  ) {
    return this.mentors.replaceOwnAvailability(request.user.id, dto);
  }
}
