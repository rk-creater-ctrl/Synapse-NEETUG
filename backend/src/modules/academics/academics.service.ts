import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AcademicDto, ListDto } from './dto';

const resourceMap = {
  exams: ['exam', undefined],
  subjects: ['subject', 'examId'],
  classes: ['academicClass', 'subjectId'],
  chapters: ['chapter', 'classId'],
  topics: ['topic', 'chapterId'],
  subtopics: ['subtopic', 'topicId'],
} as const;

type Resource = keyof typeof resourceMap;
type AcademicModel = {
  findMany: (args: unknown) => Prisma.PrismaPromise<unknown[]>;
  findFirst: (args: unknown) => Prisma.PrismaPromise<unknown>;
  count: (args: unknown) => Prisma.PrismaPromise<number>;
  create: (args: unknown) => Prisma.PrismaPromise<unknown>;
  update: (args: unknown) => Prisma.PrismaPromise<unknown>;
};

const visible = { isActive: true, isPublished: true };

@Injectable()
export class AcademicsService {
  constructor(private readonly db: PrismaService) {}

  async list(resource: Resource, query: ListDto, publicOnly = true) {
    const model = this.model(resource);
    const where: Record<string, unknown> = publicOnly
      ? this.publicVisibility(resource)
      : {};
    const parentField = resourceMap[resource][1];

    if (parentField && query[parentField]) {
      where[parentField] = query[parentField];
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const allowedSort = ['displayOrder', 'name', 'createdAt'];
    const sort = allowedSort.includes(query.sort ?? '')
      ? query.sort!
      : 'displayOrder';
    const orderBy = { [sort]: query.order === 'desc' ? 'desc' : 'asc' };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await this.db.$transaction([
      model.findMany({ where, skip, take: query.limit, orderBy }),
      model.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async get(resource: Resource, id: string) {
    const record = await this.model(resource).findFirst({
      where: { id, ...this.publicVisibility(resource) },
    });
    if (!record) {
      throw new NotFoundException('Academic record not found');
    }
    return record;
  }

  async create(resource: Resource, dto: AcademicDto) {
    const parentField = resourceMap[resource][1];
    if (parentField && !dto[parentField]) {
      throw new BadRequestException(`${parentField} is required`);
    }
    try {
      return await this.model(resource).create({ data: dto });
    } catch (error) {
      this.rethrowKnownDatabaseError(error, resource);
    }
  }

  async update(resource: Resource, id: string, dto: Partial<AcademicDto>) {
    await this.getForAdmin(resource, id);
    try {
      return await this.model(resource).update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowKnownDatabaseError(error, resource);
    }
  }

  private model(resource: Resource): AcademicModel {
    const modelName = resourceMap[resource]?.[0];
    if (!modelName) {
      throw new NotFoundException('Unknown academic resource');
    }
    return (this.db as unknown as Record<string, AcademicModel>)[modelName];
  }

  private async getForAdmin(resource: Resource, id: string) {
    const record = await this.model(resource).findFirst({ where: { id } });
    if (!record) {
      throw new NotFoundException('Academic record not found');
    }
    return record;
  }

  private rethrowKnownDatabaseError(error: unknown, resource: Resource): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException({
          code: 'ACADEMIC_CONFLICT',
          message: `A conflicting ${resource.slice(0, -1)} record already exists.`,
        });
      }
      if (error.code === 'P2003') {
        throw new BadRequestException({
          code: 'INVALID_ACADEMIC_REFERENCE',
          message: 'The referenced parent academic record does not exist.',
        });
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Academic record not found');
      }
    }
    throw error;
  }

  private publicVisibility(resource: Resource): Record<string, unknown> {
    switch (resource) {
      case 'exams':
        return { ...visible };
      case 'subjects':
        return { ...visible, exam: { is: visible } };
      case 'classes':
        return {
          ...visible,
          subject: { is: { ...visible, exam: { is: visible } } },
        };
      case 'chapters':
        return {
          ...visible,
          academicClass: {
            is: {
              ...visible,
              subject: { is: { ...visible, exam: { is: visible } } },
            },
          },
        };
      case 'topics':
        return {
          ...visible,
          chapter: {
            is: {
              ...visible,
              academicClass: {
                is: {
                  ...visible,
                  subject: { is: { ...visible, exam: { is: visible } } },
                },
              },
            },
          },
        };
      case 'subtopics':
        return {
          ...visible,
          topic: {
            is: {
              ...visible,
              chapter: {
                is: {
                  ...visible,
                  academicClass: {
                    is: {
                      ...visible,
                      subject: { is: { ...visible, exam: { is: visible } } },
                    },
                  },
                },
              },
            },
          },
        };
    }
  }
}
