import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  ContentImportDuplicateStrategy,
  ContentImportTarget,
} from '@prisma/client';

export class PreviewContentImportDto {
  @IsEnum(ContentImportTarget)
  target!: ContentImportTarget;

  @IsOptional()
  @IsEnum(ContentImportDuplicateStrategy)
  duplicateStrategy: ContentImportDuplicateStrategy = ContentImportDuplicateStrategy.ERROR;
}

export class ContentImportListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
