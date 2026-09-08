import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  NestInterceptor,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { ContentManagementRoles } from '../../shared/decorators/content-management-roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { ContentImportListDto, PreviewContentImportDto } from './content-imports.dto';
import { ContentImportsService } from './content-imports.service';
import { MAX_IMPORT_BYTES, type UploadedImportFile } from './import-file.parser';

const MultipartImportInterceptor = FileInterceptor('file', {
  limits: { fileSize: MAX_IMPORT_BYTES },
});

function isMulterFileSizeError(error: unknown): boolean {
  if (error instanceof PayloadTooLargeException) {
    return true;
  }
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'LIMIT_FILE_SIZE';
}

@Injectable()
class ContentImportUploadInterceptor implements NestInterceptor {
  private readonly multipart = new MultipartImportInterceptor();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(Promise.resolve(this.multipart.intercept(context, next))).pipe(
      mergeMap((response) => response),
      catchError((error: unknown) => {
        if (isMulterFileSizeError(error)) {
          return throwError(() => new PayloadTooLargeException({
            statusCode: 413,
            code: 'IMPORT_FILE_TOO_LARGE',
            message: 'Import files may not exceed 5 MB.',
          }));
        }
        return throwError(() => error);
      }),
    );
  }
}

@ApiTags('admin content imports')
@ApiBearerAuth()
@Controller('admin/content-imports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ContentManagementRoles()
export class ContentImportsController {
  constructor(private readonly imports: ContentImportsService) {}

  @Post('preview')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Validate and persist a content-import preview without mutating CMS content',
  })
  @ApiResponse({ status: 201, description: 'Preview job and row validation results.' })
  @ApiResponse({ status: 400, description: 'Invalid file, headers, rows, or duplicate strategy.' })
  @ApiResponse({ status: 413, description: 'Import file exceeds the 5 MB limit.' })
  @UseInterceptors(ContentImportUploadInterceptor)
  preview(
    @Req() request: { user: { id: string } },
    @Body() dto: PreviewContentImportDto,
    @UploadedFile() file?: UploadedImportFile,
  ) {
    return this.imports.preview(request.user.id, dto, file);
  }

  @Get()
  @ApiOperation({ summary: 'List auditable CMS content-import jobs' })
  list(@Query() query: ContentImportListDto) {
    return this.imports.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a content-import job and its import summary' })
  get(@Param('id') id: string) {
    return this.imports.get(id);
  }

  @Get(':id/rows')
  @ApiOperation({ summary: 'List persisted validation or apply results for import rows' })
  rows(@Param('id') id: string, @Query() query: ContentImportListDto) {
    return this.imports.rows(id, query);
  }

  @Post(':id/apply')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Explicitly apply a valid import transactionally',
    description: 'Revalidates persisted rows and applies all mutations atomically, or rolls them all back.',
  })
  @ApiResponse({ status: 201, description: 'Import applied with audit events.' })
  @ApiResponse({ status: 409, description: 'Import was already applied.' })
  apply(@Param('id') id: string, @Req() request: { user: { id: string } }) {
    return this.imports.apply(id, request.user.id);
  }
}
