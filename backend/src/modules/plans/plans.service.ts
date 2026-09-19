import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingInterval, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  AdminSubscriptionPlanListDto,
  CreateSubscriptionPlanDto,
  PlanFeatureDto,
  UpdateSubscriptionPlanDto,
} from './plans.dto';

const planSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  currency: true,
  priceMinor: true,
  billingInterval: true,
  billingIntervalCount: true,
  active: true,
  published: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  features: {
    orderBy: { key: 'asc' },
    select: { key: true, enabled: true, limit: true },
  },
} as const;

type PlanFeatureInput = { key: string; enabled: boolean; limit: number | null };
type PlanRecord = Prisma.SubscriptionPlanGetPayload<{ select: typeof planSelect }>;

@Injectable()
export class PlansService {
  constructor(private readonly db: PrismaService) {}

  async catalog() {
    const plans = await this.db.subscriptionPlan.findMany({
      where: { active: true, published: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: planSelect,
    });
    return plans.map((plan) => this.toCatalogResponse(plan));
  }

  async listAdmin(query: AdminSubscriptionPlanListDto = new AdminSubscriptionPlanListDto()) {
    const where: Prisma.SubscriptionPlanWhereInput = {};
    if (query.active !== undefined) where.active = query.active;
    if (query.published !== undefined) where.published = query.published;
    if (query.search?.trim()) {
      where.OR = [
        { code: { contains: query.search.trim().toUpperCase(), mode: 'insensitive' } },
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.db.$transaction([
      this.db.subscriptionPlan.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: planSelect,
      }),
      this.db.subscriptionPlan.count({ where }),
    ]);
    return {
      items: items.map((plan) => this.toAdminResponse(plan)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getAdmin(planId: string) {
    const plan = await this.db.subscriptionPlan.findUnique({ where: { id: planId }, select: planSelect });
    if (!plan) this.planNotFound();
    return this.toAdminResponse(plan);
  }

  async create(dto: CreateSubscriptionPlanDto) {
    const input = this.createInput(dto);
    try {
      const plan = await this.db.subscriptionPlan.create({
        data: {
          ...input,
          features: { create: input.features },
        },
        select: planSelect,
      });
      return this.toAdminResponse(plan);
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  async update(planId: string, dto: UpdateSubscriptionPlanDto) {
    const existing = await this.db.subscriptionPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        billingInterval: true,
        billingIntervalCount: true,
      },
    });
    if (!existing) this.planNotFound();

    const input = this.updateInput(existing, dto);
    try {
      const plan = await this.db.$transaction((tx) => tx.subscriptionPlan.update({
        where: { id: planId },
        data: {
          ...input.data,
          ...(input.features ? {
            features: {
              deleteMany: {},
              create: input.features,
            },
          } : {}),
        },
        select: planSelect,
      }));
      return this.toAdminResponse(plan);
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  private createInput(dto: CreateSubscriptionPlanDto) {
    const billingInterval = dto.billingInterval;
    const billingIntervalCount = dto.billingIntervalCount;
    this.validatePlanValues({
      code: dto.code,
      name: dto.name,
      currency: dto.currency,
      priceMinor: dto.priceMinor,
      billingInterval,
      billingIntervalCount,
      sortOrder: dto.sortOrder ?? 0,
    });
    return {
      code: this.code(dto.code),
      name: dto.name.trim(),
      description: this.description(dto.description),
      currency: this.currency(dto.currency),
      priceMinor: dto.priceMinor,
      billingInterval,
      billingIntervalCount,
      active: dto.active ?? true,
      published: dto.published ?? false,
      sortOrder: dto.sortOrder ?? 0,
      features: this.features(dto.features ?? []),
    };
  }

  private updateInput(
    existing: { billingInterval: BillingInterval; billingIntervalCount: number },
    dto: UpdateSubscriptionPlanDto,
  ) {
    const billingInterval = dto.billingInterval ?? existing.billingInterval;
    const billingIntervalCount = dto.billingIntervalCount ?? existing.billingIntervalCount;
    this.validatePlanValues({
      name: dto.name,
      currency: dto.currency,
      priceMinor: dto.priceMinor,
      billingInterval,
      billingIntervalCount,
      sortOrder: dto.sortOrder,
    });
    return {
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: this.description(dto.description) } : {}),
        ...(dto.currency !== undefined ? { currency: this.currency(dto.currency) } : {}),
        ...(dto.priceMinor !== undefined ? { priceMinor: dto.priceMinor } : {}),
        ...(dto.billingInterval !== undefined ? { billingInterval: dto.billingInterval } : {}),
        ...(dto.billingIntervalCount !== undefined ? { billingIntervalCount: dto.billingIntervalCount } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.published !== undefined ? { published: dto.published } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      ...(dto.features !== undefined ? { features: this.features(dto.features) } : {}),
    };
  }

  private features(features: PlanFeatureDto[]): PlanFeatureInput[] {
    const normalized = features.map((feature) => {
      const key = feature.key.trim().toLowerCase();
      if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/.test(key) || key.length > 120) {
        this.invalidFeature();
      }
      if (feature.limit !== undefined && (
        !Number.isInteger(feature.limit)
        || feature.limit < 0
        || feature.limit > 2_147_483_647
      )) {
        this.invalidFeature();
      }
      return { key, enabled: feature.enabled ?? true, limit: feature.limit ?? null };
    });
    if (new Set(normalized.map((feature) => feature.key)).size !== normalized.length) {
      throw new ConflictException({
        code: 'PLAN_FEATURE_KEY_DUPLICATE',
        message: 'Plan feature keys must be unique within a plan.',
      });
    }
    return normalized;
  }

  private validatePlanValues(input: {
    code?: string;
    name?: string;
    currency?: string;
    priceMinor?: number;
    billingInterval: BillingInterval;
    billingIntervalCount: number;
    sortOrder?: number;
  }) {
    if (input.code !== undefined && !/^[A-Za-z][A-Za-z0-9_]*$/.test(input.code.trim())) this.invalidPlan();
    if (input.code !== undefined && input.code.trim().length > 64) this.invalidPlan();
    if (input.name !== undefined && (!input.name.trim() || input.name.trim().length > 200)) this.invalidPlan();
    if (input.currency !== undefined && !/^[A-Za-z]{3}$/.test(input.currency.trim())) this.invalidPlan();
    if (input.priceMinor !== undefined && (
      !Number.isInteger(input.priceMinor)
      || input.priceMinor < 0
      || input.priceMinor > 2_147_483_647
    )) this.invalidPlan();
    if (!Object.values(BillingInterval).includes(input.billingInterval)) this.invalidPlan();
    if (
      !Number.isInteger(input.billingIntervalCount)
      || input.billingIntervalCount < 1
      || input.billingIntervalCount > 10_000
    ) this.invalidPlan();
    if (input.billingInterval === BillingInterval.ONE_TIME && input.billingIntervalCount !== 1) this.invalidPlan();
    if (input.sortOrder !== undefined && (
      !Number.isInteger(input.sortOrder)
      || input.sortOrder < 0
      || input.sortOrder > 2_147_483_647
    )) this.invalidPlan();
  }

  private code(value: string) {
    return value.trim().toUpperCase();
  }

  private currency(value: string) {
    return value.trim().toUpperCase();
  }

  private description(value?: string) {
    const description = value?.trim();
    if (description && description.length > 5000) this.invalidPlan();
    return description || null;
  }

  private toCatalogResponse(plan: PlanRecord) {
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      currency: plan.currency,
      priceMinor: plan.priceMinor,
      billingInterval: plan.billingInterval,
      billingIntervalCount: plan.billingIntervalCount,
      features: plan.features,
    };
  }

  private toAdminResponse(plan: PlanRecord) {
    return {
      ...this.toCatalogResponse(plan),
      active: plan.active,
      published: plan.published,
      sortOrder: plan.sortOrder,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private invalidPlan(): never {
    throw new BadRequestException({
      code: 'SUBSCRIPTION_PLAN_INVALID',
      message: 'Subscription plan details are invalid.',
    });
  }

  private invalidFeature(): never {
    throw new BadRequestException({
      code: 'PLAN_FEATURE_INVALID',
      message: 'Plan feature details are invalid.',
    });
  }

  private planNotFound(): never {
    throw new NotFoundException({
      code: 'SUBSCRIPTION_PLAN_NOT_FOUND',
      message: 'Subscription plan not found.',
    });
  }

  private rethrowDatabaseError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        code: 'SUBSCRIPTION_PLAN_CODE_CONFLICT',
        message: 'A subscription plan with this code already exists.',
      });
    }
    throw error;
  }
}
