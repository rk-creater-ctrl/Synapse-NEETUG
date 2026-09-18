import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import {
  AddCommunityMemberDto,
  CommunityMessageHistoryQueryDto,
  CreateCommunityDto,
  CreateCommunityMessageDto,
  CreateCommunityMessageWithAttachmentsDto,
  UpdateCommunityMemberRoleDto,
} from './community.dto';
import { CommunityGateway } from './community.gateway';
import { CommunityMessageAttachmentsInterceptor } from './community-message-attachments.interceptor';
import { CommunityMessagesService } from './community-messages.service';
import { CommunityService } from './community.service';

type AuthenticatedRequest = { user: { id: string } };
type UploadedAttachment = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type BinaryResponse = { setHeader(name: string, value: string): void; send(body: Buffer): void };

@ApiTags('communities')
@ApiBearerAuth()
@Controller('communities')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(
    private readonly communities: CommunityService,
    private readonly messages: CommunityMessagesService,
    private readonly gateway: CommunityGateway,
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

  @Post(':communityId/messages/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a text and/or attachment community message as an authorized member' })
  @UseInterceptors(CommunityMessageAttachmentsInterceptor)
  async createMessageWithAttachments(
    @Req() request: AuthenticatedRequest,
    @Param('communityId') communityId: string,
    @Body() dto: CreateCommunityMessageWithAttachmentsDto,
    @UploadedFiles() files?: UploadedAttachment[],
  ) {
    const message = await this.messages.createWithAttachments(request.user.id, communityId, dto, files);
    this.gateway.broadcastMessage(message);
    return message;
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

  @Get('attachments/:attachmentId')
  @ApiOperation({ summary: 'Read an authorized community message attachment' })
  async readAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) response: BinaryResponse,
  ) {
    const attachment = await this.messages.readAttachmentForUser(request.user.id, attachmentId);
    const safeFileName = attachment.fileName
      .replace(/^.*[\\/]/, '')
      .replace(/["\\\r\n\u0000-\u001f\u007f]/g, '_')
      .slice(0, 255) || 'attachment';
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `${attachment.inline ? 'inline' : 'attachment'}; filename="${safeFileName}"`);
    response.send(attachment.buffer);
  }

  @Get(':communityId')
  @ApiOperation({ summary: 'Get a public community or a private community visible to the authenticated member' })
  get(@Req() request: AuthenticatedRequest, @Param('communityId') communityId: string) {
    return this.communities.getForUser(request.user.id, communityId);
  }
}
