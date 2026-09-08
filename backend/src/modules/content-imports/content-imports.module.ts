import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ContentImportsController } from './content-imports.controller';
import { ContentImportsService } from './content-imports.service';

@Module({
  controllers: [ContentImportsController],
  providers: [ContentImportsService, PrismaService, RolesGuard],
})
export class ContentImportsModule {}
