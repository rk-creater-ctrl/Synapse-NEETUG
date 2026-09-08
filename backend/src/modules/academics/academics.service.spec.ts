import { AcademicsService } from './academics.service';

describe('AcademicsService public visibility', () => {
  const model = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const db = {
    $transaction: jest.fn(),
    exam: model,
    subject: model,
    academicClass: model,
    chapter: model,
    topic: model,
    subtopic: model,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    model.findMany.mockResolvedValue([]);
    model.count.mockResolvedValue(0);
  });

  it('hides a subject when its exam is inactive or unpublished', async () => {
    const service = new AcademicsService(db as never);

    await service.list('subjects', { page: 1, limit: 20 });

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          isPublished: true,
          exam: { is: { isActive: true, isPublished: true } },
        }),
      }),
    );
  });

  it('requires every ancestor to be visible for a topic', async () => {
    const service = new AcademicsService(db as never);

    await service.list('topics', { page: 1, limit: 20 });

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chapter: expect.objectContaining({ is: expect.any(Object) }),
        }),
      }),
    );
  });

  it('does not apply student visibility filters to admin lists', async () => {
    const service = new AcademicsService(db as never);

    await service.list('chapters', { page: 1, limit: 20 }, false);

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('preserves an explicit unpublished state in CMS writes', async () => {
    const service = new AcademicsService(db as never);
    model.create.mockResolvedValue({ id: 'exam-1', isPublished: false });
    model.findFirst.mockResolvedValue({ id: 'exam-1', isPublished: true });
    model.update.mockResolvedValue({ id: 'exam-1', isPublished: false });

    await service.create('exams', {
      name: 'Draft exam',
      slug: 'draft-exam',
      isPublished: false,
    });

    expect(model.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isPublished: false }),
    });

    await service.update('exams', 'exam-1', { isPublished: false });
    expect(model.update).toHaveBeenCalledWith({
      where: { id: 'exam-1' },
      data: { isPublished: false },
    });
  });
});
