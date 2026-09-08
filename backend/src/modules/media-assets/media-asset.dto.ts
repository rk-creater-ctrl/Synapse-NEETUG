import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class MediaAssetListDto {
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
  @Length(1, 200)
  search?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  provider?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  mimeType?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class MediaAssetDto {
  @IsString()
  @Length(1, 100)
  provider!: string;

  @IsString()
  @Length(1, 512)
  externalKey!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Length(1, 2048)
  url?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMediaAssetDto extends PartialType(MediaAssetDto) {}
