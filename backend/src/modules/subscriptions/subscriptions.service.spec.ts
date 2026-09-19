import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingInterval, Prisma, SubscriptionStatus } from '@prisma/client';

import { calculateSubscriptionPeriodEnd, SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  const timestamp = new Date('2026-09-19T10:00:00.000Z');
  const plan = (overrides: Record<string, unknown> = {}) => ({
    id: 'plan-1',
    code: 'PREMIUM_MONTHLY',
    name: 'Premium Monthly',
    currency: 'INR',
    priceMinor: 49900,
    billingInterval: BillingInterval.MONTH,
    billingIntervalCount: 1,
    active: true,
    published: true,
    ...overrides,
  });
  const subscription = (overrides: Record<string, unknown> = {}) => ({
    id: 'subscription-1',
    userId: 'user-student',
    planId: 'plan-1',
    status: SubscriptionStatus.PENDING,
    startsAt: null,
    currentPeriodStartAt: null,
    currentPeriodEndAt: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    endedAt: null,
    planCodeSnapshot: 'PREMIUM_MONTHLY',
    planNameSnapshot: 'Premium Monthly',
    currencySnapshot: 'INR',
    priceMinorSnapshot: 49900,
    billingIntervalSnapshot: BillingInterval.MONTH,
    billingIntervalCountSnapshot: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    plan: { id: 'plan-1', code: 'PREMIUM_MONTHLY' },
    ...overrides,
  });

  let subscriptions: Record<string, jest.Mock>;
  let plans: Record<string, jest.Mock>;
  let db: Record<string, unknown>;
  let service: SubscriptionsService;

  beforeEach(() => {
    subscriptions = {
      findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(),
    };
    plans = { findUnique: jest.fn() };
    const transaction = { subscription: subscriptions, subscriptionPlan: plans };
    db = {
      subscription: subscriptions,
      subscriptionPlan: plans,
      $transaction: jest.fn((work: unknown) => {
        if (typeof work === 'function') return work(transaction);
        return Promise.all(work as Promise<unknown>[]);
      }),
    };
    service = new SubscriptionsService(db as never);
  });

  it('returns only the authenticated user\'s current subscription, or an explicit empty state', async () => {
    subscriptions.findFirst.mockResolvedValueOnce(subscription({ userId: 'user-student' }));
    await expect(service.getCurrentForUser('user-student')).resolves.toMatchObject({
      subscription: { id: 'subscription-1', userId: 'user-student' },
    });
    expect(subscriptions.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-student' }),
    }));

    subscriptions.findFirst.mockResolvedValueOnce(null);
    await expect(service.getCurrentForUser('user-without-subscription')).resolves.toEqual({ subscription: null });
  });

  it('provides bounded, filtered subscription history to administrators while preserving snapshots', async () => {
    const historical = subscription({
      status: SubscriptionStatus.EXPIRED,
      plan: { id: 'plan-1', code: 'RENAMED_CURRENT_PLAN' },
      planNameSnapshot: 'Premium Monthly at purchase',
    });
    subscriptions.findMany.mockResolvedValueOnce([historical]);
    subscriptions.count.mockResolvedValueOnce(1);

    const result = await service.listAdmin({ page: 1, limit: 20, userId: 'user-student', status: SubscriptionStatus.EXPIRED });

    expect(subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-student', status: SubscriptionStatus.EXPIRED },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    expect(result.items[0]).toMatchObject({
      plan: { code: 'RENAMED_CURRENT_PLAN' },
      planSnapshot: { name: 'Premium Monthly at purchase', priceMinor: 49900 },
    });
  });

  it('creates a pending subscription from the authoritative purchasable plan snapshot only', async () => {
    plans.findUnique.mockResolvedValueOnce(plan());
    subscriptions.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(subscription({
      userId: data.userId,
      planId: data.planId,
      planCodeSnapshot: data.planCodeSnapshot,
      planNameSnapshot: data.planNameSnapshot,
      currencySnapshot: data.currencySnapshot,
      priceMinorSnapshot: data.priceMinorSnapshot,
      billingIntervalSnapshot: data.billingIntervalSnapshot,
      billingIntervalCountSnapshot: data.billingIntervalCountSnapshot,
    })));

    await expect(service.createPendingSubscription('user-student', 'plan-1', timestamp)).resolves.toMatchObject({
      status: SubscriptionStatus.PENDING,
      planSnapshot: {
        code: 'PREMIUM_MONTHLY', name: 'Premium Monthly', currency: 'INR', priceMinor: 49900,
      },
    });
    expect(plans.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'plan-1' } }));
    expect(subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      userId: 'user-student',
      priceMinorSnapshot: 49900,
      currencySnapshot: 'INR',
      planNameSnapshot: 'Premium Monthly',
    }) }));
  });

  it('rejects inactive or unpublished plans before creating a subscription candidate', async () => {
    plans.findUnique.mockResolvedValueOnce(plan({ active: false }));
    await expect(service.createPendingSubscription('user-student', 'plan-1')).rejects.toBeInstanceOf(BadRequestException);

    plans.findUnique.mockResolvedValueOnce(plan({ published: false }));
    await expect(service.createPendingSubscription('user-student', 'plan-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(subscriptions.create).not.toHaveBeenCalled();
  });

  it('maps the database current-subscription guard to a safe conflict', async () => {
    plans.findUnique.mockResolvedValueOnce(plan());
    subscriptions.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test',
    }));

    await expect(service.createPendingSubscription('user-student', 'plan-1'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'SUBSCRIPTION_CURRENT_EXISTS' }) });
  });

  it('activates a pending subscription exactly once and uses the snapshotted billing period', async () => {
    const pending = subscription({ billingIntervalSnapshot: BillingInterval.MONTH, billingIntervalCountSnapshot: 1 });
    const active = subscription({
      status: SubscriptionStatus.ACTIVE,
      startsAt: timestamp,
      currentPeriodStartAt: timestamp,
      currentPeriodEndAt: new Date('2026-10-19T10:00:00.000Z'),
    });
    subscriptions.findUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce(active);
    subscriptions.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(service.activateSubscription('subscription-1', timestamp)).resolves.toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEndAt: new Date('2026-10-19T10:00:00.000Z'),
    });
    expect(subscriptions.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'subscription-1', status: { in: [SubscriptionStatus.PENDING] } },
      data: expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
    }));
  });

  it('rejects invalid lifecycle transitions instead of reviving expired subscriptions', async () => {
    subscriptions.findUnique.mockResolvedValueOnce(subscription({ status: SubscriptionStatus.EXPIRED }));

    await expect(service.activateSubscription('subscription-1', timestamp)).rejects.toBeInstanceOf(ConflictException);
    expect(subscriptions.updateMany).not.toHaveBeenCalled();
  });

  it('preserves active access until a cancellation-at-period-end expires, while immediate cancellation ends it', async () => {
    const active = subscription({ status: SubscriptionStatus.ACTIVE });
    const cancelling = subscription({ status: SubscriptionStatus.ACTIVE, cancelAtPeriodEnd: true, cancelledAt: timestamp });
    subscriptions.findUnique.mockResolvedValueOnce(active).mockResolvedValueOnce(cancelling);
    subscriptions.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(service.cancelAtPeriodEndSubscription('subscription-1', timestamp)).resolves.toMatchObject({
      status: SubscriptionStatus.ACTIVE, cancelAtPeriodEnd: true,
    });

    subscriptions.findUnique.mockResolvedValueOnce(active).mockResolvedValueOnce(subscription({
      status: SubscriptionStatus.CANCELLED, cancelledAt: timestamp, endedAt: timestamp,
    }));
    subscriptions.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.cancelSubscription('subscription-1', timestamp)).resolves.toMatchObject({
      status: SubscriptionStatus.CANCELLED, endedAt: timestamp,
    });
  });

  it('expires ACTIVE or PAST_DUE subscriptions without changing their purchase-time snapshot', async () => {
    const active = subscription({ status: SubscriptionStatus.PAST_DUE });
    const expired = subscription({ status: SubscriptionStatus.EXPIRED, endedAt: timestamp });
    subscriptions.findUnique.mockResolvedValueOnce(active).mockResolvedValueOnce(expired);
    subscriptions.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(service.expireSubscription('subscription-1', timestamp)).resolves.toMatchObject({
      status: SubscriptionStatus.EXPIRED,
      endedAt: timestamp,
      planSnapshot: { code: 'PREMIUM_MONTHLY', priceMinor: 49900 },
    });
    expect(subscriptions.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'subscription-1', status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] } },
    }));
  });
});

describe('calculateSubscriptionPeriodEnd', () => {
  const start = new Date('2026-01-15T12:30:00.000Z');

  it('calculates DAY and WEEK periods using UTC-safe durations', () => {
    expect(calculateSubscriptionPeriodEnd(start, BillingInterval.DAY, 2)).toEqual(new Date('2026-01-17T12:30:00.000Z'));
    expect(calculateSubscriptionPeriodEnd(start, BillingInterval.WEEK, 2)).toEqual(new Date('2026-01-29T12:30:00.000Z'));
  });

  it('calculates calendar MONTH and YEAR periods without fixed-day approximations', () => {
    expect(calculateSubscriptionPeriodEnd(new Date('2026-01-31T12:30:00.000Z'), BillingInterval.MONTH, 1))
      .toEqual(new Date('2026-02-28T12:30:00.000Z'));
    expect(calculateSubscriptionPeriodEnd(new Date('2024-02-29T12:30:00.000Z'), BillingInterval.YEAR, 1))
      .toEqual(new Date('2025-02-28T12:30:00.000Z'));
  });

  it('leaves ONE_TIME plans without an inferred recurring period end', () => {
    expect(calculateSubscriptionPeriodEnd(start, BillingInterval.ONE_TIME, 1)).toBeNull();
  });
});
