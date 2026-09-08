import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MediaAssetListDto } from './media-asset.dto';
import { MediaAssetsService } from './media-assets.service';

describe('MediaAssetsService', () => {
  const db = {
    $transaction: jest.fn(),
    mediaAsset: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: MediaAssetsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaAssetsService(db as never);
    db.$transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
    db.mediaAsset.findMany.mockResolvedValue([]);
    db.mediaAsset.count.mockResolvedValue(0);
  });

  it('returns the normalized list contract with active/provider filters', async () => {
    await expect(service.list(Object.assign(new MediaAssetListDto(), {
      provider: 'LOCAL', isActive: false,
    }))).resolves.toEqual({
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(db.mediaAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ provider: 'LOCAL', isActive: false }),
    }));
  });

  it('rejects nonexistent and inactive media references for new assignments', async () => {
    db.mediaAsset.findUnique.mockResolvedValueOnce(null);
    await expect(service.assertActiveForAssignment('missing')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_MEDIA_ASSET_REFERENCE' }),
    });

    db.mediaAsset.findUnique.mockResolvedValueOnce({ id: 'asset-1', isActive: false });
    await expect(service.assertActiveForAssignment('asset-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows content without a media asset and an active assigned asset', async () => {
    await expect(service.assertActiveForAssignment(undefined)).resolves.toBeUndefined();
    db.mediaAsset.findUnique.mockResolvedValue({ id: 'asset-1', isActive: true });
    await expect(service.assertActiveForAssignment('asset-1')).resolves.toBeUndefined();
  });

  it('maps provider/external-key uniqueness conflicts to a clean error', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.19.0',
    });
    db.mediaAsset.create.mockRejectedValue(conflict);

    await expect(service.create({ provider: 'LOCAL', externalKey: 'asset-1' })).rejects.toBeInstanceOf(ConflictException);
  });
});
