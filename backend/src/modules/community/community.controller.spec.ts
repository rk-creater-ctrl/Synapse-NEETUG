import 'reflect-metadata';
import { validate } from 'class-validator';

import { CommunityType, CommunityVisibility } from '@prisma/client';

import { CommunityController } from './community.controller';
import { CreateCommunityDto } from './community.dto';

describe('CommunityController', () => {
  it('derives all create/list/detail identity from the authenticated request', async () => {
    const communities = {
      create: jest.fn().mockResolvedValue({ id: 'community-1' }),
      listForUser: jest.fn().mockResolvedValue([]),
      getForUser: jest.fn().mockResolvedValue({ id: 'community-1' }),
    };
    const controller = new CommunityController(communities as never);
    const request = { user: { id: 'user-authenticated' } };
    const dto = {
      name: 'Physics', type: CommunityType.GROUP, visibility: CommunityVisibility.PUBLIC,
    };

    await controller.create(request, dto);
    await controller.listMine(request);
    await controller.get(request, 'community-1');

    expect(communities.create).toHaveBeenCalledWith('user-authenticated', dto);
    expect(communities.listForUser).toHaveBeenCalledWith('user-authenticated');
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
});
