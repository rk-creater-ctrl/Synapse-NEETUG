import { DailyStudyService } from './daily-study.service';

describe('DailyStudyService Phase 8F orchestration/read model', () => {
  const module = {
    id: 'module-1',
    studyDate: new Date('2026-09-10T00:00:00.000Z'),
    status: 'NOT_STARTED',
    generatedAt: new Date(),
    startedAt: null,
    completedAt: null,
  };
  const task = (
    id: string,
    slug: string,
    displayOrder: number,
    references: Record<string, string | null>,
  ) => ({
    id,
    type: references.questionId ? 'QUESTION' : references.flashcardId ? 'FLASHCARD' : references.revisionItemId ? 'REVISION' : 'VIDEO',
    status: 'PENDING',
    displayOrder,
    subject: { id: `${slug}-id`, name: slug, slug },
    chapter: null,
    topic: null,
    subtopic: null,
    questionId: null,
    flashcardId: null,
    revisionItemId: null,
    videoId: null,
    ...references,
  });

  const createService = () => {
    const db = {
      dailyStudyModule: { findFirst: jest.fn() },
      question: { findMany: jest.fn().mockResolvedValue([]) },
      flashcard: { findMany: jest.fn().mockResolvedValue([]) },
      revisionItem: { findMany: jest.fn().mockResolvedValue([]) },
      video: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const physics = { populate: jest.fn().mockResolvedValue([]) };
    const chemistry = { populate: jest.fn().mockResolvedValue([]) };
    const biology = { populate: jest.fn().mockResolvedValue([]) };
    const service = new DailyStudyService(
      db as never,
      physics as never,
      chemistry as never,
      biology as never,
    );
    jest.spyOn(service, 'getOrCreateDailyModule').mockResolvedValue(module as never);
    jest.spyOn(service, 'generatePhysicsDailyTasks').mockResolvedValue([]);
    jest.spyOn(service, 'generateChemistryDailyTasks').mockResolvedValue([]);
    jest.spyOn(service, 'generateBiologyDailyTasks').mockResolvedValue([]);
    return { db, service };
  };

  it('orchestrates all PCB generators and returns Physics, Chemistry, Biology order', async () => {
    const { db, service } = createService();
    db.dailyStudyModule.findFirst.mockResolvedValue({
      ...module,
      tasks: [
        task('bio-2', 'biology', 2, { revisionItemId: 'revision-1' }),
        task('physics-2', 'physics', 2, { questionId: 'question-2' }),
        task('physics-1', 'physics', 1, { questionId: 'question-1' }),
        task('chem-1', 'chemistry', 1, { videoId: 'video-1' }),
      ],
    });
    db.question.findMany.mockResolvedValue([
      {
        id: 'question-1',
        stem: 'Safe question',
        type: 'SINGLE_CORRECT_MCQ',
        difficulty: 'MEDIUM',
        tags: [],
        options: [{ id: 'option-1', position: 1, text: 'Option' }],
      },
    ]);
    db.revisionItem.findMany.mockResolvedValue([
      { id: 'revision-1', title: 'Revision', type: 'BIOLOGY_FACT', content: 'Fact' },
    ]);
    db.video.findMany.mockResolvedValue([
      { id: 'video-1', title: 'Video', description: null, instructorName: null, thumbnailUrl: null, durationSeconds: 60, displayOrder: 1 },
    ]);

    const result = await service.getOrGenerateDailyModule('student-1', '2026-09-10');

    expect(service.generatePhysicsDailyTasks).toHaveBeenCalledWith('student-1', module.studyDate);
    expect(service.generateChemistryDailyTasks).toHaveBeenCalledWith('student-1', module.studyDate);
    expect(service.generateBiologyDailyTasks).toHaveBeenCalledWith('student-1', module.studyDate);
    expect(result.subjects.map((group) => group.subject.slug)).toEqual([
      'physics',
      'chemistry',
      'biology',
    ]);
    expect(result.subjects[0].tasks.map((item) => item.id)).toEqual([
      'physics-1',
      'physics-2',
    ]);
    const question = result.subjects[0].tasks[0].content as Record<string, unknown>;
    expect(question).toEqual(expect.objectContaining({ stem: 'Safe question' }));
    expect(question).not.toHaveProperty('explanation');
    expect(question).not.toHaveProperty('isCorrect');
    expect(question).not.toHaveProperty('correctOptionId');
  });

  it('keeps unavailable source tasks as safe unavailable placeholders', async () => {
    const { db, service } = createService();
    db.dailyStudyModule.findFirst.mockResolvedValue({
      ...module,
      tasks: [task('physics-1', 'physics', 1, { questionId: 'hidden-question' })],
    });

    const result = await service.getOrGenerateDailyModule('student-1', '2026-09-10');
    const dailyTask = result.subjects[0].tasks[0];

    expect(dailyTask).toEqual(expect.objectContaining({
      id: 'physics-1',
      available: false,
      content: null,
    }));
    expect(result.status).toBe('NOT_STARTED');
  });
});
