import { RoleName } from '@prisma/client';

import { AdminSubscriptionsController, SubscriptionsController } from './subscriptions.controller';

describe('SubscriptionsController', () => {
  it('reads only the authenticated user\'s subscription and exposes no student lifecycle mutation route', async () => {
    const subscriptions = { getCurrentForUser: jest.fn().mockResolvedValue({ subscription: null }) };
    const controller = new SubscriptionsController(subscriptions as never);

    await expect(controller.getMine({ user: { id: 'user-student' } })).resolves.toEqual({ subscription: null });
    expect(subscriptions.getCurrentForUser).toHaveBeenCalledWith('user-student');
    expect(Object.getOwnPropertyNames(SubscriptionsController.prototype)).toEqual(
      expect.arrayContaining(['constructor', 'getMine']),
    );
    expect(Object.getOwnPropertyNames(SubscriptionsController.prototype)).not.toContain('activate');
  });
});

describe('AdminSubscriptionsController', () => {
  const subscriptions = { listAdmin: jest.fn(), getAdmin: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('delegates bounded administration reads to the subscription service', async () => {
    const controller = new AdminSubscriptionsController(subscriptions as never);
    const query = { page: 1, limit: 20, userId: 'user-student' };

    await controller.list(query);
    await controller.get('subscription-1');

    expect(subscriptions.listAdmin).toHaveBeenCalledWith(query);
    expect(subscriptions.getAdmin).toHaveBeenCalledWith('subscription-1');
  });

  it('requires ADMIN or SUPER_ADMIN rather than allowing ordinary students to inspect subscriptions', () => {
    const roles = Reflect.getMetadata('roles', AdminSubscriptionsController) as RoleName[];

    expect(roles).toEqual([RoleName.ADMIN, RoleName.SUPER_ADMIN]);
    expect(roles).not.toContain(RoleName.STUDENT);
  });
});
