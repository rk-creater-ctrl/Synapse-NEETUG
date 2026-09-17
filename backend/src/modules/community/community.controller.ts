import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import {
  AddCommunityMemberDto,
  CommunityMessageHistoryQueryDto,
  CreateCommunityDto,
  CreateCommunityMessageDto,
  UpdateCommunityMemberRoleDto,
} from './community.dto';
import { CommunityMessagesService } from './community-messages.service';
import { CommunityService } from './community.service';

type AuthenticatedRequest = { user: { id: string } };

@ApiTags('communities')
@ApiBearerAuth()
@Controller('communities')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(
    private readonly communities: CommunityService,
    private readonly messages: CommunityMessagesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a community with the authenticated creator as owner' })
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateCommunityDto) {
    return this.communities.create(request.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Discover public communities' })
  discover(@Req() request: AuthenticatedRequest) {
    return this.communities.discoverPublic(request.user.id);
  }

  @Get('me')
  @ApiOperation({ summary: 'List communities for the authenticated member' })
  listMine(@Req() request: AuthenticatedRequest) {
    return this.communities.listForUser(request.user.id);
  }

  @Post(':communityId/join')
  @ApiOperation({ summary: 'Join a public group as a community member' })
  join(@Req() request: AuthenticatedRequest, @Param('communityId') communityId: string) {
    return this.communities.joinPublicGroup(request.user.id, communityId);
  }

  @Post(':communityId/leave')
  @ApiOperation({ summary: 'Leave an owned community membership' })
  leave(@Req() request: AuthenticatedRequest, @Param('communityId') communityId: string) {
    return this.communities.leave(request.user.id, communityId);
  }

  @Post(':communityId/members')
  @ApiOperation({ summary: 'Add a member to a community as owner or admin' })
  addMember(
    @Req() request: AuthenticatedRequest,
    @Param('communityId') communityId: string,
    @Body() dto: AddCommunityMemberDto,
  ) {
    return this.communities.addMember(request.user.id, communityId, dto.userId);
  }

  @Get(':communityId/members')
  @ApiOperation({ summary: 'List safe active community members' })
  listMembers(@Req() request: AuthenticatedRequest, @Param('communityId') communityId: string) {
    return this.communities.listMembers(request.user.id, communityId);
  }

  @Patch(':communityId/members/:userId/role')
  @ApiOperation({ summary: 'Update a managed community member role' })
  updateMemberRole(
    @Req() request: AuthenticatedRequest,
    @Param('communityId') communityId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateCommunityMemberRoleDto,
  ) {
    return this.communities.updateMemberRole(request.user.id, communityId, userId, dto.role);
  }

  @Delete(':communityId/members/:userId')
  @ApiOperation({ summary: 'Remove a managed community member without banning them' })
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('communityId') communityId: string,
    @Param('userId') userId: string,
  ) {
    return this.communities.removeMember(request.user.id, communityId, userId);
  }

  @Post(':communityId/messages')
  @ApiOperation({ summary: 'Create a text message as an authorized community member' })
  createMessage(
    @Req() request: AuthenticatedRequest,
    @Param('communityId') communityId: string,
    @Body() dto: CreateCommunityMessageDto,
  ) {
    return this.messages.create(request.user.id, communityId, dto);
  }

  @Get(':communityId/messages')
  @ApiOperation({ summary: 'Read community message history with chronological cursor pages' })
  listMessages(
    @Req() request: AuthenticatedRequest,
    @Param('communityId') communityId: string,
    @Query() query: CommunityMessageHistoryQueryDto,
  ) {
    return this.messages.list(request.user.id, communityId, query);
  }

  @Get(':communityId')
  @ApiOperation({ summary: 'Get a public community or a private community visible to the authenticated member' })
  get(@Req() request: AuthenticatedRequest, @Param('communityId') communityId: string) {
    return this.communities.getForUser(request.user.id, communityId);
  }
}
