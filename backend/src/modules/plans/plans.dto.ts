import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BillingInterval } from '@prisma/client';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class PlanFeatureDto {
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/)
  key!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  limit?: number;
}

export class CreateSubscriptionPlanDto {
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  code!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  priceMinor!: number;

  @IsEnum(BillingInterval)
  billingInterval!: BillingInterval;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  billingIntervalCount!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features?: PlanFeatureDto[];
}

export class UpdateSubscriptionPlanDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  priceMinor?: number;

  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  billingIntervalCount?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features?: PlanFeatureDto[];
}

export class AdminSubscriptionPlanListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  published?: boolean;
}
