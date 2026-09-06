import { PrismaClient, RevisionType, RoleName, VideoProvider } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  for (const name of Object.values(RoleName)) await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash: await argon2.hash(password) } });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SUPER_ADMIN } });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  }
  const exam = await prisma.exam.upsert({ where: { slug: 'neet-ug' }, update: { name: 'NEET UG' }, create: { name: 'NEET UG', slug: 'neet-ug' } });
  for (const name of ['Physics', 'Chemistry', 'Biology']) {
    const subject = await prisma.subject.upsert({ where: { examId_slug: { examId: exam.id, slug: name.toLowerCase() } }, update: {}, create: { examId: exam.id, name, slug: name.toLowerCase() } });
    for (const level of ['11', '12']) await prisma.academicClass.upsert({ where: { subjectId_slug: { subjectId: subject.id, slug: `class-${level}` } }, update: {}, create: { subjectId: subject.id, name: `Class ${level}`, slug: `class-${level}` } });
    if (name !== 'Physics') continue;
    const academicClass = await prisma.academicClass.findUniqueOrThrow({ where: { subjectId_slug: { subjectId: subject.id, slug: 'class-11' } } });
    const chapter = await prisma.chapter.upsert({ where: { classId_slug: { classId: academicClass.id, slug: 'units-and-measurements' } }, update: {}, create: { classId: academicClass.id, name: 'Units and Measurements', slug: 'units-and-measurements' } });
    const topic = await prisma.topic.upsert({ where: { chapterId_slug: { chapterId: chapter.id, slug: 'physical-quantities' } }, update: {}, create: { chapterId: chapter.id, name: 'Physical Quantities', slug: 'physical-quantities' } });
    const hierarchy = { examId: exam.id, subjectId: subject.id, academicClassId: academicClass.id, chapterId: chapter.id, topicId: topic.id };
    await prisma.video.upsert({ where: { slug: 'physical-quantities-introduction' }, update: {}, create: { title: 'Physical Quantities: Introduction', slug: 'physical-quantities-introduction', ...hierarchy, provider: VideoProvider.LOCAL, providerAssetId: 'https://example.com/physical-quantities.mp4', durationSeconds: 600, isPublished: true, isFree: true } });
    await prisma.video.upsert({ where: { slug: 'physical-quantities-draft' }, update: {}, create: { title: 'Physical Quantities: Draft', slug: 'physical-quantities-draft', ...hierarchy, provider: VideoProvider.LOCAL, providerAssetId: 'https://example.com/draft.mp4', durationSeconds: 480, isPublished: false, isFree: true } });
    await prisma.revisionItem.upsert({ where: { id: 'seed-formula-units' }, update: {}, create: { id: 'seed-formula-units', title: 'SI unit reminder', type: RevisionType.FORMULA, content: 'Use SI base units consistently.', ...hierarchy, isPublished: true } });
    await prisma.revisionItem.upsert({ where: { id: 'seed-note-units' }, update: {}, create: { id: 'seed-note-units', title: 'Physical quantities note', type: RevisionType.SHORT_NOTE, content: 'Every measurement has a magnitude and a unit.', ...hierarchy, isPublished: true } });
    const cards = [
      ['seed-flashcard-physical-quantity', 'What is a physical quantity?', 'A measurable property expressed by a numerical magnitude and a unit.', 'Physical quantities allow observations to be compared consistently.'],
      ['seed-flashcard-si-units', 'What is an SI unit?', 'A standard unit from the International System of Units used for scientific measurement.', 'Use SI units in calculations unless another unit is explicitly required.'],
      ['seed-flashcard-fundamental-quantities', 'What are fundamental quantities?', 'Independent base quantities, such as length, mass, time, electric current, temperature, amount of substance, and luminous intensity.', 'Their SI base units cannot be derived from other units.'],
      ['seed-flashcard-derived-quantities', 'What are derived quantities?', 'Quantities formed by combining fundamental quantities, such as velocity, force, and density.', 'For example, velocity has unit m s⁻¹.'],
      ['seed-flashcard-dimensions', 'What does the dimensional formula of a quantity show?', 'The powers of fundamental quantities needed to express that physical quantity.', 'Dimensions help check the consistency of physical equations.'],
    ] as const;
    for (let index = 0; index < cards.length; index += 1) {
      const [id, frontContent, backContent, explanation] = cards[index];
      await prisma.flashcard.upsert({ where: { id }, update: {}, create: { id, frontContent, backContent, explanation, ...hierarchy, isPublished: true, isActive: true, isPremium: false, sortOrder: index + 1 } });
    }
  }
}

main().finally(() => prisma.$disconnect());
