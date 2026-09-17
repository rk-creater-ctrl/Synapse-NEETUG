import 'reflect-metadata';
import { validate } from 'class-validator';

import { CommunityMemberRole, CommunityType, CommunityVisibility } from '@prisma/client';

import { CommunityController } from './community.controller';
import {
  CommunityMessageHistoryQueryDto,
  CreateCommunityDto,
  CreateCommunityMessageDto,
  UpdateCommunityMemberRoleDto,
} from './community.dto';

describe('CommunityController', () => {
  it('derives all create/list/detail identity from the authenticated request', async () => {
    const communities = {
      create: jest.fn().mockResolvedValue({ id: 'community-1' }),
      discoverPublic: jest.fn().mockResolvedValue([]),
      listForUser: jest.fn().mockResolvedValue([]),
      getForUser: jest.fn().mockResolvedValue({ id: 'community-1' }),
      joinPublicGroup: jest.fn().mockResolvedValue({ id: 'community-1' }),
      leave: jest.fn().mockResolvedValue({ left: true }),
      addMember: jest.fn().mockResolvedValue({ userId: 'user-target' }),
      listMembers: jest.fn().mockResolvedValue([]),
      updateMemberRole: jest.fn().mockResolvedValue({ userId: 'user-target' }),
      removeMember: jest.fn().mockResolvedValue({ removed: true }),
    };
    const messages = {
      create: jest.fn().mockResolvedValue({ id: 'message-1' }),
      list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const controller = new CommunityController(communities as never, messages as never);
    const request = { user: { id: 'user-authenticated' } };
    const dto = {
      name: 'Physics', type: CommunityType.GROUP, visibility: CommunityVisibility.PUBLIC,
    };

    await controller.create(request, dto);
    await controller.discover(request);
    await controller.listMine(request);
    await controller.join(request, 'community-1');
    await controller.leave(request, 'community-1');
    await controller.addMember(request, 'community-1', { userId: 'user-target' });
    await controller.listMembers(request, 'community-1');
    await controller.updateMemberRole(request, 'community-1', 'user-target', { role: CommunityMemberRole.MODERATOR });
    await controller.removeMember(request, 'community-1', 'user-target');
    await controller.createMessage(request, 'community-1', { content: 'Hello community' });
    await controller.listMessages(request, 'community-1', { limit: 20 });
    await controller.get(request, 'community-1');

    expect(communities.create).toHaveBeenCalledWith('user-authenticated', dto);
    expect(communities.discoverPublic).toHaveBeenCalledWith('user-authenticated');
    expect(communities.listForUser).toHaveBeenCalledWith('user-authenticated');
    expect(communities.joinPublicGroup).toHaveBeenCalledWith('user-authenticated', 'community-1');
    expect(communities.leave).toHaveBeenCalledWith('user-authenticated', 'community-1');
    expect(communities.addMember).toHaveBeenCalledWith('user-authenticated', 'community-1', 'user-target');
    expect(communities.listMembers).toHaveBeenCalledWith('user-authenticated', 'community-1');
    expect(communities.updateMemberRole).toHaveBeenCalledWith('user-authenticated', 'community-1', 'user-target', CommunityMemberRole.MODERATOR);
    expect(communities.removeMember).toHaveBeenCalledWith('user-authenticated', 'community-1', 'user-target');
    expect(messages.create).toHaveBeenCalledWith('user-authenticated', 'community-1', { content: 'Hello community' });
    expect(messages.list).toHaveBeenCalledWith('user-authenticated', 'community-1', { limit: 20 });
    expect(communities.getForUser).toHaveBeenCalledWith('user-authenticated', 'community-1');
  });

  it('uses DTO validation for bounded community input', async () => {
    const dto = new CreateCommunityDto();
    dto.name = 'x'.repeat(161);
    dto.description = 'description';
    dto.type = CommunityType.GROUP;
    dto.visibility = CommunityVisibility.PRIVATE;

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('rejects arbitrary community membership roles at the DTO boundary', async () => {
    const dto = new UpdateCommunityMemberRoleDto();
    dto.role = 'OWNERISH' as CommunityMemberRole;

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('validates bounded text-message and history inputs', async () => {
    const message = new CreateCommunityMessageDto();
    message.content = 'x'.repeat(4001);
    const history = new CommunityMessageHistoryQueryDto();
    history.limit = 101;

    await expect(validate(message)).resolves.not.toHaveLength(0);
    await expect(validate(history)).resolves.not.toHaveLength(0);
  });
});
