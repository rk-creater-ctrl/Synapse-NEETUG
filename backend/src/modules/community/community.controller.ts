import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CreateCommunityDto } from './community.dto';
import { CommunityService } from './community.service';

type AuthenticatedRequest = { user: { id: string } };

@ApiTags('communities')
@ApiBearerAuth()
@Controller('communities')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(private readonly communities: CommunityService) {}

  @Post()
  @ApiOperation({ summary: 'Create a community with the authenticated creator as owner' })
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateCommunityDto) {
    return this.communities.create(request.user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List communities for the authenticated member' })
  listMine(@Req() request: AuthenticatedRequest) {
    return this.communities.listForUser(request.user.id);
  }

  @Get(':communityId')
  @ApiOperation({ summary: 'Get a public community or a private community visible to the authenticated member' })
  get(@Req() request: AuthenticatedRequest, @Param('communityId') communityId: string) {
    return this.communities.getForUser(request.user.id, communityId);
  }
}
