import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingInterval, Prisma, SubscriptionStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { AdminSubscriptionListQueryDto } from './subscriptions.dto';

const currentSubscriptionStatuses = [
  SubscriptionStatus.PENDING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
] as const;

const subscriptionSelect = {
  id: true,
  userId: true,
  planId: true,
  status: true,
  startsAt: true,
  currentPeriodStartAt: true,
  currentPeriodEndAt: true,
  cancelAtPeriodEnd: true,
  cancelledAt: true,
  endedAt: true,
  planCodeSnapshot: true,
  planNameSnapshot: true,
  currencySnapshot: true,
  priceMinorSnapshot: true,
  billingIntervalSnapshot: true,
  billingIntervalCountSnapshot: true,
  createdAt: true,
  updatedAt: true,
  plan: { select: { id: true, code: true } },
} as const;

const planSnapshotSelect = {
  id: true,
  code: true,
  name: true,
  currency: true,
  priceMinor: true,
  billingInterval: true,
  billingIntervalCount: true,
  active: true,
  published: true,
} as const;

type SubscriptionRecord = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>;

export function calculateSubscriptionPeriodEnd(
  start: Date,
  interval: BillingInterval,
  count: number,
): Date | null {
  if (!Number.isInteger(count) || count < 1) {
    throw new BadRequestException({
      code: 'SUBSCRIPTION_PERIOD_INVALID',
      message: 'Subscription billing period is invalid.',
    });
  }

  switch (interval) {
    case BillingInterval.ONE_TIME:
      // One-time catalog items do not recur and have no inferred expiry.
      return null;
    case BillingInterval.DAY:
      return new Date(start.getTime() + count * 24 * 60 * 60 * 1000);
    case BillingInterval.WEEK:
      return new Date(start.getTime() + count * 7 * 24 * 60 * 60 * 1000);
    case BillingInterval.MONTH:
      return addUtcMonths(start, count);
    case BillingInterval.YEAR:
      return addUtcMonths(start, count * 12);
  }
}

function addUtcMonths(start: Date, monthCount: number): Date {
  const combinedMonth = start.getUTCMonth() + monthCount;
  const targetYear = start.getUTCFullYear() + Math.floor(combinedMonth / 12);
  const targetMonth = ((combinedMonth % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(start.getUTCDate(), lastDayOfTargetMonth),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  ));
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly db: PrismaService) {}

  async getCurrentForUser(userId: string) {
    const subscription = await this.db.subscription.findFirst({
      where: { userId, status: { in: [...currentSubscriptionStatuses] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: subscriptionSelect,
    });
    return { subscription: subscription ? this.toResponse(subscription) : null };
  }

  async listAdmin(query: AdminSubscriptionListQueryDto = new AdminSubscriptionListQueryDto()) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.subscription.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: subscriptionSelect,
      }),
      this.db.subscription.count({ where }),
    ]);

    return {
      items: items.map((subscription) => this.toResponse(subscription)),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async getAdmin(subscriptionId: string) {
    const subscription = await this.db.subscription.findUnique({
      where: { id: subscriptionId },
      select: subscriptionSelect,
    });
    if (!subscription) this.subscriptionNotFound();
    return this.toResponse(subscription);
  }

  // Internal-only lifecycle entry point for a future trusted checkout/payment flow.
  async createPendingSubscription(userId: string, planId: string, now = new Date()) {
    try {
      return await this.db.$transaction(async (tx) => {
        const plan = await tx.subscriptionPlan.findUnique({
          where: { id: planId },
          select: planSnapshotSelect,
        });
        if (!plan || !plan.active || !plan.published) this.planNotPurchasable();

        const subscription = await tx.subscription.create({
          data: {
            userId,
            planId: plan.id,
            status: SubscriptionStatus.PENDING,
            createdAt: now,
            planCodeSnapshot: plan.code,
            planNameSnapshot: plan.name,
            currencySnapshot: plan.currency,
            priceMinorSnapshot: plan.priceMinor,
            billingIntervalSnapshot: plan.billingInterval,
            billingIntervalCountSnapshot: plan.billingIntervalCount,
          },
          select: subscriptionSelect,
        });
        return this.toResponse(subscription);
      });
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  async activateSubscription(subscriptionId: string, now = new Date()) {
    return this.transition(subscriptionId, [SubscriptionStatus.PENDING], (subscription) => ({
      status: SubscriptionStatus.ACTIVE,
      startsAt: now,
      currentPeriodStartAt: now,
      currentPeriodEndAt: calculateSubscriptionPeriodEnd(
        now,
        subscription.billingIntervalSnapshot,
        subscription.billingIntervalCountSnapshot,
      ),
    }), SubscriptionStatus.ACTIVE);
  }

  async markPastDue(subscriptionId: string, now = new Date()) {
    return this.transition(subscriptionId, [SubscriptionStatus.ACTIVE], () => ({
      status: SubscriptionStatus.PAST_DUE,
    }), SubscriptionStatus.PAST_DUE);
  }

  async cancelAtPeriodEndSubscription(subscriptionId: string, now = new Date()) {
    return this.transition(subscriptionId, [SubscriptionStatus.ACTIVE], () => ({
      cancelAtPeriodEnd: true,
      cancelledAt: now,
    }), SubscriptionStatus.ACTIVE, (subscription) =>
      subscription.status === SubscriptionStatus.ACTIVE && subscription.cancelAtPeriodEnd);
  }

  async cancelSubscription(subscriptionId: string, now = new Date()) {
    return this.transition(
      subscriptionId,
      [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
      () => ({
        status: SubscriptionStatus.CANCELLED,
        cancelAtPeriodEnd: false,
        cancelledAt: now,
        endedAt: now,
      }),
      SubscriptionStatus.CANCELLED,
      (subscription) => subscription.status === SubscriptionStatus.CANCELLED,
    );
  }

  async expireSubscription(subscriptionId: string, now = new Date()) {
    return this.transition(
      subscriptionId,
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
      () => ({ status: SubscriptionStatus.EXPIRED, endedAt: now }),
      SubscriptionStatus.EXPIRED,
      (subscription) => subscription.status === SubscriptionStatus.EXPIRED,
    );
  }

  private async transition(
    subscriptionId: string,
    permittedStatuses: SubscriptionStatus[],
    data: (subscription: SubscriptionRecord) => Prisma.SubscriptionUpdateManyMutationInput,
    idempotentStatus: SubscriptionStatus,
    isIdempotent: (subscription: SubscriptionRecord) => boolean = (subscription) => subscription.status === idempotentStatus,
  ) {
    return this.db.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        select: subscriptionSelect,
      });
      if (!subscription) this.subscriptionNotFound();
      if (isIdempotent(subscription)) return this.toResponse(subscription);
      if (!permittedStatuses.includes(subscription.status)) this.invalidTransition();

      const updated = await tx.subscription.updateMany({
        where: { id: subscriptionId, status: { in: permittedStatuses } },
        data: data(subscription),
      });
      if (updated.count !== 1) this.transitionConflict();

      const result = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        select: subscriptionSelect,
      });
      if (!result) this.subscriptionNotFound();
      return this.toResponse(result);
    });
  }

  private toResponse(subscription: SubscriptionRecord) {
    return {
      id: subscription.id,
      userId: subscription.userId,
      status: subscription.status,
      startsAt: subscription.startsAt,
      currentPeriodStartAt: subscription.currentPeriodStartAt,
      currentPeriodEndAt: subscription.currentPeriodEndAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      endedAt: subscription.endedAt,
      plan: subscription.plan,
      planSnapshot: {
        code: subscription.planCodeSnapshot,
        name: subscription.planNameSnapshot,
        currency: subscription.currencySnapshot,
        priceMinor: subscription.priceMinorSnapshot,
        billingInterval: subscription.billingIntervalSnapshot,
        billingIntervalCount: subscription.billingIntervalCountSnapshot,
      },
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  private planNotPurchasable(): never {
    throw new BadRequestException({
      code: 'SUBSCRIPTION_PLAN_NOT_PURCHASABLE',
      message: 'The subscription plan is not available for purchase.',
    });
  }

  private subscriptionNotFound(): never {
    throw new NotFoundException({
      code: 'SUBSCRIPTION_NOT_FOUND',
      message: 'Subscription not found.',
    });
  }

  private invalidTransition(): never {
    throw new ConflictException({
      code: 'SUBSCRIPTION_TRANSITION_INVALID',
      message: 'Subscription lifecycle transition is not allowed.',
    });
  }

  private transitionConflict(): never {
    throw new ConflictException({
      code: 'SUBSCRIPTION_TRANSITION_CONFLICT',
      message: 'Subscription state changed before the operation completed.',
    });
  }

  private rethrowDatabaseError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        code: 'SUBSCRIPTION_CURRENT_EXISTS',
        message: 'A current subscription already exists for this user.',
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new BadRequestException({
        code: 'SUBSCRIPTION_REFERENCE_INVALID',
        message: 'Subscription references are invalid.',
      });
    }
    throw error;
  }
}
