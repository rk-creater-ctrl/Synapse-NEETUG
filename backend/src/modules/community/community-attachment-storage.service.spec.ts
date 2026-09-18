import { BadRequestException } from '@nestjs/common';
import { CommunityAttachmentType } from '@prisma/client';

import {
  CommunityAttachmentStorageService,
  MAX_COMMUNITY_ATTACHMENTS,
  MAX_COMMUNITY_IMAGE_BYTES,
  UploadedCommunityAttachment,
} from './community-attachment-storage.service';

describe('CommunityAttachmentStorageService', () => {
  let service: CommunityAttachmentStorageService;

  const upload = (
    mimetype: string,
    buffer: Buffer,
    originalname = 'study-file',
  ): UploadedCommunityAttachment => ({
    mimetype,
    buffer,
    size: buffer.length,
    originalname,
  });

  beforeEach(() => {
    service = new CommunityAttachmentStorageService({ get: jest.fn().mockReturnValue('C:/private/community-files') } as never);
  });

  const allowedFiles: Array<{ mimetype: string; buffer: Buffer; type: CommunityAttachmentType }> = [
    { mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]), type: CommunityAttachmentType.IMAGE },
    { mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), type: CommunityAttachmentType.IMAGE },
    { mimetype: 'image/webp', buffer: Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary'), type: CommunityAttachmentType.IMAGE },
    { mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'), type: CommunityAttachmentType.DOCUMENT },
  ];

  it.each(allowedFiles)('prepares allowed $mimetype files with server-owned storage keys', ({ mimetype, buffer, type }) => {
    const [attachment] = service.prepare([upload(mimetype, buffer, '../../revision-notes.pdf')]);

    expect(attachment).toMatchObject({ type, originalFileName: 'revision-notes.pdf', mimeType: mimetype });
    expect(attachment.storageKey).toMatch(/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/);
    expect(attachment.storageKey).not.toContain('revision-notes');
  });

  it('rejects unsupported and signature-mismatched uploads', () => {
    expect(() => service.prepare([upload('image/svg+xml', Buffer.from('<svg/>'), 'unsafe.svg')]))
      .toThrow(BadRequestException);
    expect(() => service.prepare([upload('application/pdf', Buffer.from('not a pdf'), 'unsafe.exe')]))
      .toThrow(BadRequestException);
  });

  it('enforces per-image size and per-message attachment count limits', () => {
    const tooLargeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_COMMUNITY_IMAGE_BYTES)]);
    expect(() => service.prepare([upload('image/jpeg', tooLargeJpeg, 'large.jpg')]))
      .toThrow(BadRequestException);

    const png = upload('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(() => service.prepare(Array.from({ length: MAX_COMMUNITY_ATTACHMENTS + 1 }, () => png)))
      .toThrow(BadRequestException);
  });
});
