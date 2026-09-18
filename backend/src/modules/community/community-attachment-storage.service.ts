import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join, resolve, sep } from 'path';

import { CommunityAttachmentType } from '@prisma/client';

export const MAX_COMMUNITY_ATTACHMENTS = 4;
export const MAX_COMMUNITY_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_COMMUNITY_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_COMMUNITY_ATTACHMENT_TOTAL_BYTES = 40 * 1024 * 1024;

export type UploadedCommunityAttachment = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type StoredCommunityAttachment = {
  type: CommunityAttachmentType;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
};

type AttachmentPolicy = {
  type: CommunityAttachmentType;
  maxBytes: number;
  extension: string;
  hasExpectedSignature: (buffer: Buffer) => boolean;
};

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const attachmentPolicies: Readonly<Record<string, AttachmentPolicy>> = {
  'image/jpeg': {
    type: CommunityAttachmentType.IMAGE,
    maxBytes: MAX_COMMUNITY_IMAGE_BYTES,
    extension: 'jpg',
    hasExpectedSignature: (buffer) => buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE),
  },
  'image/png': {
    type: CommunityAttachmentType.IMAGE,
    maxBytes: MAX_COMMUNITY_IMAGE_BYTES,
    extension: 'png',
    hasExpectedSignature: (buffer) => buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
  },
  'image/webp': {
    type: CommunityAttachmentType.IMAGE,
    maxBytes: MAX_COMMUNITY_IMAGE_BYTES,
    extension: 'webp',
    hasExpectedSignature: (buffer) => buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'application/pdf': {
    type: CommunityAttachmentType.DOCUMENT,
    maxBytes: MAX_COMMUNITY_DOCUMENT_BYTES,
    extension: 'pdf',
    hasExpectedSignature: (buffer) => buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  },
};

@Injectable()
export class CommunityAttachmentStorageService {
  private readonly rootDirectory: string;

  constructor(config: ConfigService) {
    this.rootDirectory = resolve(
      config.get<string>('COMMUNITY_ATTACHMENT_STORAGE_DIR')
        ?? join(process.cwd(), 'storage', 'community-attachments'),
    );
  }

  prepare(files: UploadedCommunityAttachment[] | undefined): Array<StoredCommunityAttachment & { buffer: Buffer }> {
    const uploads = files ?? [];
    if (uploads.length > MAX_COMMUNITY_ATTACHMENTS) {
      throw new BadRequestException({
        code: 'COMMUNITY_ATTACHMENT_LIMIT_EXCEEDED',
        message: `A message may include at most ${MAX_COMMUNITY_ATTACHMENTS} attachments.`,
      });
    }

    let totalBytes = 0;
    return uploads.map((file) => {
      const policy = attachmentPolicies[file.mimetype];
      const sizeBytes = file.buffer?.length ?? 0;
      totalBytes += sizeBytes;
      if (!policy) this.invalidAttachment();
      if (!Buffer.isBuffer(file.buffer) || sizeBytes === 0 || file.size !== sizeBytes) {
        this.invalidAttachment();
      }
      if (sizeBytes > policy.maxBytes) this.attachmentTooLarge(policy.type);
      if (!policy.hasExpectedSignature(file.buffer)) this.invalidAttachment();
      if (totalBytes > MAX_COMMUNITY_ATTACHMENT_TOTAL_BYTES) {
        throw new BadRequestException({
          code: 'COMMUNITY_ATTACHMENT_TOTAL_TOO_LARGE',
          message: 'The combined attachment size may not exceed 40 MB.',
        });
      }

      return {
        type: policy.type,
        storageKey: `${randomUUID()}.${policy.extension}`,
        originalFileName: this.safeOriginalFileName(file.originalname),
        mimeType: file.mimetype,
        sizeBytes,
        buffer: file.buffer,
      };
    });
  }

  async store(attachments: Array<StoredCommunityAttachment & { buffer: Buffer }>): Promise<StoredCommunityAttachment[]> {
    const stored: StoredCommunityAttachment[] = [];
    try {
      await mkdir(this.rootDirectory, { recursive: true });
      for (const attachment of attachments) {
        const metadata = this.withoutBuffer(attachment);
        stored.push(metadata);
        await writeFile(this.pathFor(attachment.storageKey), attachment.buffer, { flag: 'wx' });
      }
      return stored;
    } catch (error) {
      await this.remove(stored.map((attachment) => attachment.storageKey));
      throw error;
    }
  }

  async remove(storageKeys: string[]): Promise<void> {
    await Promise.all(storageKeys.map(async (storageKey) => {
      try {
        await rm(this.pathFor(storageKey), { force: true });
      } catch {
        // Best-effort cleanup must not hide the original persistence failure.
      }
    }));
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.pathFor(storageKey));
  }

  private withoutBuffer(attachment: StoredCommunityAttachment & { buffer: Buffer }): StoredCommunityAttachment {
    const { buffer: _buffer, ...metadata } = attachment;
    return metadata;
  }

  private pathFor(storageKey: string): string {
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp|pdf)$/.test(storageKey)) {
      throw new Error('Invalid community attachment storage key.');
    }
    const target = resolve(this.rootDirectory, storageKey);
    if (!target.startsWith(`${this.rootDirectory}${sep}`)) {
      throw new Error('Invalid community attachment storage path.');
    }
    return target;
  }

  private safeOriginalFileName(value: string): string {
    const base = (typeof value === 'string' ? value : '')
      .replace(/^.*[\\/]/, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    return (base || 'attachment').slice(0, 255);
  }

  private invalidAttachment(): never {
    throw new BadRequestException({
      code: 'COMMUNITY_ATTACHMENT_INVALID',
      message: 'Only JPEG, PNG, WebP images and PDF documents are supported.',
    });
  }

  private attachmentTooLarge(type: CommunityAttachmentType): never {
    throw new BadRequestException({
      code: 'COMMUNITY_ATTACHMENT_TOO_LARGE',
      message: type === CommunityAttachmentType.IMAGE
        ? 'Image attachments may not exceed 10 MB.'
        : 'Document attachments may not exceed 20 MB.',
    });
  }
}
