import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BillingInterval, Prisma } from '@prisma/client';

import { PlansService } from './plans.service';

describe('PlansService', () => {
  const createdAt = new Date('2026-09-19T00:00:00.000Z');
  const plan = (overrides: Record<string, unknown> = {}) => ({
    id: 'plan-1',
    code: 'PREMIUM_MONTHLY',
    name: 'Premium Monthly',
    description: 'Full NEET access',
    currency: 'INR',
    priceMinor: 49900,
    billingInterval: BillingInterval.MONTH,
    billingIntervalCount: 1,
    active: true,
    published: true,
    sortOrder: 10,
    createdAt,
    updatedAt: createdAt,
    features: [
      { key: 'qbank.full_access', enabled: true, limit: null },
      { key: 'tests.full_access', enabled: true, limit: null },
    ],
    ...overrides,
  });
  let plans: Record<string, jest.Mock>;
  let db: Record<string, unknown>;
  let service: PlansService;

  beforeEach(() => {
    plans = {
      findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(),
    };
    db = {
      subscriptionPlan: plans,
      $transaction: jest.fn((work: unknown) => {
        if (typeof work === 'function') return work({ subscriptionPlan: plans });
        return Promise.all(work as Promise<unknown>[]);
      }),
    };
    service = new PlansService(db as never);
  });

  it('lists only active published plans in deterministic catalog order with safe feature definitions', async () => {
    plans.findMany.mockResolvedValueOnce([plan()]);

    const result = await service.catalog();

    expect(plans.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, published: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }));
    expect(result).toEqual([expect.objectContaining({
      code: 'PREMIUM_MONTHLY', priceMinor: 49900,
      features: expect.arrayContaining([expect.objectContaining({ key: 'qbank.full_access', enabled: true })]),
    })]);
    expect(result[0]).not.toHaveProperty('active');
    expect(result[0]).not.toHaveProperty('sortOrder');
  });

  it('keeps inactive and unpublished plans available only to the paginated admin catalog', async () => {
    const inactive = plan({ active: false, published: false });
    plans.findMany.mockResolvedValueOnce([inactive]);
    plans.count.mockResolvedValueOnce(1);

    const result = await service.listAdmin({ page: 1, limit: 20, active: false });

    expect(result).toMatchObject({ items: [expect.objectContaining({ active: false, published: false })] });
    expect(plans.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: false }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }));
  });

  it('creates a normalized plan with integer minor-unit pricing and normalized feature keys', async () => {
    plans.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(plan({
      code: data.code,
      name: data.name,
      currency: data.currency,
      priceMinor: data.priceMinor,
      features: (data.features as { create: unknown[] }).create,
    })));

    await expect(service.create({
      code: 'premium_monthly', name: ' Premium Monthly ', description: ' Full access ', currency: 'inr',
      priceMinor: 49900, billingInterval: BillingInterval.MONTH, billingIntervalCount: 1,
      features: [{ key: 'QBANK.FULL_ACCESS', enabled: true }],
    })).resolves.toMatchObject({ code: 'PREMIUM_MONTHLY', currency: 'INR', priceMinor: 49900 });
    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ code: 'PREMIUM_MONTHLY', name: 'Premium Monthly', description: 'Full access', currency: 'INR' }),
    }));
  });

  it('rejects invalid monetary values, intervals, and duplicate feature keys before persistence', async () => {
    const valid = {
      code: 'PREMIUM_MONTHLY', name: 'Premium', currency: 'INR', priceMinor: 49900,
      billingInterval: BillingInterval.MONTH, billingIntervalCount: 1,
    };
    await expect(service.create({ ...valid, priceMinor: -1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...valid, billingInterval: BillingInterval.ONE_TIME, billingIntervalCount: 2 }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...valid, currency: 'INRR' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...valid, billingInterval: 'FOREVER' as BillingInterval }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...valid, features: [{ key: 'tests.full_access' }, { key: 'TESTS.FULL_ACCESS' }] }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(plans.create).not.toHaveBeenCalled();
  });

  it('maps duplicate plan codes to a safe conflict', async () => {
    plans.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test',
    }));
    await expect(service.create({
      code: 'PREMIUM_MONTHLY', name: 'Premium', currency: 'INR', priceMinor: 49900,
      billingInterval: BillingInterval.MONTH, billingIntervalCount: 1,
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SUBSCRIPTION_PLAN_CODE_CONFLICT' }) });
  });

  it('updates mutable catalog fields and features atomically without exposing a code mutation path', async () => {
    plans.findUnique.mockResolvedValueOnce({ id: 'plan-1', billingInterval: BillingInterval.MONTH, billingIntervalCount: 1 });
    plans.update.mockResolvedValueOnce(plan({ name: 'Premium Plus', published: false, features: [{ key: 'analytics.advanced', enabled: true, limit: null }] }));

    await expect(service.update('plan-1', {
      name: 'Premium Plus', published: false, features: [{ key: 'analytics.advanced' }],
    })).resolves.toMatchObject({ code: 'PREMIUM_MONTHLY', name: 'Premium Plus', published: false });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(plans.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Premium Plus', published: false,
        features: expect.objectContaining({ deleteMany: {}, create: [{ key: 'analytics.advanced', enabled: true, limit: null }] }),
      }),
    }));
    expect((plans.update.mock.calls[0][0].data as Record<string, unknown>).code).toBeUndefined();
  });

  it('returns a safe not-found result for an unknown admin plan and has no hard-delete operation', async () => {
    plans.findUnique.mockResolvedValueOnce(null);
    await expect(service.getAdmin('missing-plan')).rejects.toBeInstanceOf(NotFoundException);
    expect(plans.delete).toBeUndefined();
  });
});
