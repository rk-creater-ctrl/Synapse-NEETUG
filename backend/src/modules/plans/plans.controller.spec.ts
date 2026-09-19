import { RoleName } from '@prisma/client';

import { AdminPlansController, PlansController } from './plans.controller';

describe('PlansController', () => {
  const plans = { catalog: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('delegates the authenticated public catalog request to the plan service', async () => {
    plans.catalog.mockResolvedValue([{ id: 'plan-1', code: 'PREMIUM_MONTHLY' }]);
    const controller = new PlansController(plans as never);

    await expect(controller.catalog()).resolves.toEqual([{ id: 'plan-1', code: 'PREMIUM_MONTHLY' }]);
    expect(plans.catalog).toHaveBeenCalledTimes(1);
  });
});

describe('AdminPlansController', () => {
  const plans = {
    create: jest.fn(),
    listAdmin: jest.fn(),
    getAdmin: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('delegates only validated plan-management inputs to the service', async () => {
    const controller = new AdminPlansController(plans as never);
    const create = {
      code: 'PREMIUM_MONTHLY', name: 'Premium Monthly', currency: 'INR', priceMinor: 49900,
      billingInterval: 'MONTH' as const, billingIntervalCount: 1,
    };
    const query = { page: 1, limit: 20 };
    const update = { published: false };

    await controller.create(create);
    await controller.list(query);
    await controller.get('plan-1');
    await controller.update('plan-1', update);

    expect(plans.create).toHaveBeenCalledWith(create);
    expect(plans.listAdmin).toHaveBeenCalledWith(query);
    expect(plans.getAdmin).toHaveBeenCalledWith('plan-1');
    expect(plans.update).toHaveBeenCalledWith('plan-1', update);
  });

  it('requires ADMIN or SUPER_ADMIN rather than allowing ordinary students to mutate the catalog', () => {
    const roles = Reflect.getMetadata('roles', AdminPlansController) as RoleName[];

    expect(roles).toEqual([RoleName.ADMIN, RoleName.SUPER_ADMIN]);
    expect(roles).not.toContain(RoleName.STUDENT);
  });
});
