import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  CreateMentorDto,
  MentorListQueryDto,
  ReplaceMentorSubjectsDto,
  UpdateMentorDto,
} from './mentors.dto';

const mentorProfileSelect = {
  id: true,
  userId: true,
  fullName: true,
  headline: true,
  bio: true,
  profileImageUrl: true,
  experienceYears: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  expertise: {
    select: {
      subject: { select: { id: true, name: true } },
    },
  },
} as const;

type MentorProfileRecord = Prisma.MentorProfileGetPayload<{
  select: typeof mentorProfileSelect;
}>;

@Injectable()
export class MentorsService {
  constructor(private readonly db: PrismaService) {}

  async create(dto: CreateMentorDto) {
    this.assertExperienceYears(dto.experienceYears);
    const fullName = this.requiredFullName(dto.fullName);
    const subjectIds = this.normalizeSubjectIds(dto.subjectIds);
    await this.assertMentorUser(dto.userId);
    await this.assertSubjects(subjectIds);

    const existing = await this.db.mentorProfile.findUnique({
      where: { userId: dto.userId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'MENTOR_PROFILE_ALREADY_EXISTS',
        message: 'This user already has a mentor profile.',
      });
    }

    try {
      const mentor = await this.db.$transaction((tx) =>
        tx.mentorProfile.create({
          data: {
            userId: dto.userId,
            fullName,
            headline: this.optionalText(dto.headline),
            bio: this.optionalText(dto.bio),
            profileImageUrl: this.optionalText(dto.profileImageUrl),
            experienceYears: dto.experienceYears ?? 0,
            isActive: dto.isActive ?? true,
            expertise: { create: subjectIds.map((subjectId) => ({ subjectId })) },
          },
          select: mentorProfileSelect,
        }),
      );
      return this.toResponse(mentor);
    } catch (error) {
      this.rethrowKnownDatabaseError(error);
    }
  }

  async list(query: MentorListQueryDto = new MentorListQueryDto()) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const search = query.search?.trim();
    const where: Prisma.MentorProfileWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.subjectId
        ? { expertise: { some: { subjectId: query.subjectId } } }
        : {}),
      ...(search
        ? { fullName: { contains: search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.mentorProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: mentorProfileSelect,
      }),
      this.db.mentorProfile.count({ where }),
    ]);

    return {
      items: items.map((mentor) => this.toResponse(mentor)),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async get(id: string) {
    const mentor = await this.db.mentorProfile.findUnique({
      where: { id },
      select: mentorProfileSelect,
    });
    if (!mentor) {
      throw new NotFoundException({
        code: 'MENTOR_PROFILE_NOT_FOUND',
        message: 'Mentor profile not found.',
      });
    }
    return this.toResponse(mentor);
  }

  async update(id: string, dto: UpdateMentorDto) {
    this.assertExperienceYears(dto.experienceYears);
    await this.get(id);
    const mentor = await this.db.mentorProfile.update({
      where: { id },
      data: {
        ...(dto.fullName === undefined
          ? {}
          : { fullName: this.requiredFullName(dto.fullName) }),
        ...(dto.headline === undefined ? {} : { headline: this.optionalText(dto.headline) }),
        ...(dto.bio === undefined ? {} : { bio: this.optionalText(dto.bio) }),
        ...(dto.profileImageUrl === undefined
          ? {}
          : { profileImageUrl: this.optionalText(dto.profileImageUrl) }),
        ...(dto.experienceYears === undefined
          ? {}
          : { experienceYears: dto.experienceYears }),
      },
      select: mentorProfileSelect,
    });
    return this.toResponse(mentor);
  }

  async updateStatus(id: string, isActive: boolean) {
    await this.get(id);
    const mentor = await this.db.mentorProfile.update({
      where: { id },
      data: { isActive },
      select: mentorProfileSelect,
    });
    return this.toResponse(mentor);
  }

  async replaceSubjects(id: string, dto: ReplaceMentorSubjectsDto) {
    const subjectIds = this.normalizeSubjectIds(dto.subjectIds);
    await this.get(id);
    await this.assertSubjects(subjectIds);

    const mentor = await this.db.$transaction((tx) =>
      tx.mentorProfile.update({
        where: { id },
        data: {
          expertise: {
            deleteMany: {},
            create: subjectIds.map((subjectId) => ({ subjectId })),
          },
        },
        select: mentorProfileSelect,
      }),
    );
    return this.toResponse(mentor);
  }

  private async assertMentorUser(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'MENTOR_USER_NOT_FOUND',
        message: 'Mentor user not found.',
      });
    }
    if (!user.roles.some(({ role }) => role.name === RoleName.MENTOR)) {
      throw new BadRequestException({
        code: 'MENTOR_ROLE_REQUIRED',
        message: 'A mentor profile requires an existing MENTOR user role.',
      });
    }
  }

  private async assertSubjects(subjectIds: string[]) {
    const subjects = await this.db.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true },
    });
    if (subjects.length !== subjectIds.length) {
      throw new BadRequestException({
        code: 'MENTOR_SUBJECT_NOT_FOUND',
        message: 'One or more subjects do not exist.',
      });
    }
  }

  private normalizeSubjectIds(subjectIds: string[]) {
    const uniqueIds = [...new Set(subjectIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException({
        code: 'MENTOR_SUBJECT_REQUIRED',
        message: 'At least one subject is required.',
      });
    }
    return uniqueIds;
  }

  private assertExperienceYears(experienceYears: number | undefined) {
    if (
      experienceYears !== undefined &&
      (!Number.isInteger(experienceYears) || experienceYears < 0)
    ) {
      throw new BadRequestException({
        code: 'MENTOR_EXPERIENCE_INVALID',
        message: 'Experience years must be a non-negative integer.',
      });
    }
  }

  private optionalText(value: string | undefined) {
    const text = value?.trim();
    return text || null;
  }

  private requiredFullName(value: string) {
    const fullName = value.trim();
    if (!fullName) {
      throw new BadRequestException({
        code: 'MENTOR_FULL_NAME_REQUIRED',
        message: 'Mentor full name is required.',
      });
    }
    return fullName;
  }

  private toResponse(mentor: MentorProfileRecord) {
    const { expertise, ...profile } = mentor;
    return {
      ...profile,
      subjects: expertise
        .map(({ subject }) => ({ id: subject.id, name: subject.name }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    };
  }

  private rethrowKnownDatabaseError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException({
          code: 'MENTOR_PROFILE_ALREADY_EXISTS',
          message: 'This user already has a mentor profile.',
        });
      }
      if (error.code === 'P2003') {
        throw new BadRequestException({
          code: 'MENTOR_SUBJECT_NOT_FOUND',
          message: 'One or more subjects do not exist.',
        });
      }
      if (error.code === 'P2025') {
        throw new NotFoundException({
          code: 'MENTOR_PROFILE_NOT_FOUND',
          message: 'Mentor profile not found.',
        });
      }
    }
    throw error;
  }
}
