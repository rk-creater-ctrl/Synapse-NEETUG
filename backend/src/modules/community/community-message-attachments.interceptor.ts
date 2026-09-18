import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';

import {
  MAX_COMMUNITY_ATTACHMENTS,
  MAX_COMMUNITY_DOCUMENT_BYTES,
} from './community-attachment-storage.service';

const MultipartAttachmentsInterceptor = FilesInterceptor('files', MAX_COMMUNITY_ATTACHMENTS, {
  limits: {
    fileSize: MAX_COMMUNITY_DOCUMENT_BYTES,
    files: MAX_COMMUNITY_ATTACHMENTS,
  },
});

function multerErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

@Injectable()
export class CommunityMessageAttachmentsInterceptor implements NestInterceptor {
  private readonly multipart = new MultipartAttachmentsInterceptor();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(Promise.resolve(this.multipart.intercept(context, next))).pipe(
      mergeMap((response) => response),
      catchError((error: unknown) => {
        if (error instanceof PayloadTooLargeException || multerErrorCode(error) === 'LIMIT_FILE_SIZE') {
          return throwError(() => new PayloadTooLargeException({
            code: 'COMMUNITY_ATTACHMENT_TOO_LARGE',
            message: 'Individual attachments may not exceed 20 MB.',
          }));
        }
        if (multerErrorCode(error) === 'LIMIT_FILE_COUNT' || multerErrorCode(error) === 'LIMIT_UNEXPECTED_FILE') {
          return throwError(() => new BadRequestException({
            code: 'COMMUNITY_ATTACHMENT_LIMIT_EXCEEDED',
            message: `A message may include at most ${MAX_COMMUNITY_ATTACHMENTS} attachments.`,
          }));
        }
        return throwError(() => error);
      }),
    );
  }
}
