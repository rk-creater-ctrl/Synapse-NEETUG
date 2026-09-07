import {
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { ApproveDeviceDto, LoginDto, RegisterDto } from './dto';

type AuthUser = {
  id: string;
  roles: { role: { name: RoleName } }[];
};

const publicDeviceSelect = {
  id: true,
  installationId: true,
  deviceName: true,
  platform: true,
  isPrimary: true,
  isApproved: true,
  approvedAt: true,
  revokedAt: true,
  firstSeenAt: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
  approvalExpiresAt: true,
};

@Injectable()
export class AuthService {
  private static readonly maxApprovedStudentDevices = 2;
  private static readonly approvalTtlMs = 10 * 60 * 1000;

  constructor(
    private db: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
  ) {}

  private isStudent(user: AuthUser) {
    return user.roles.some(({ role }) => role.name === RoleName.STUDENT);
  }

  private hasValidInstallationId(installationId?: string) {
    return installationId != null &&
        installationId.length <= 255 &&
        installationId.trim().length >= 16 &&
        /^[A-Za-z0-9_-]+$/.test(installationId);
  }

  private requireValidStudentInstallation(installationId?: string) {
    if (!this.hasValidInstallationId(installationId)) {
      throw new UnauthorizedException({
        code: 'INSTALLATION_ID_REQUIRED',
        message: 'A valid installation ID is required.',
      });
    }
  }

  private async issue(user: AuthUser, deviceId?: string) {
    const roles = user.roles.map(({ role }) => role.name);
    const deviceClaim = deviceId ? { did: deviceId } : {};
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, roles, ...deviceClaim },
      {
        secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.cfg.getOrThrow('JWT_ACCESS_EXPIRES_IN') as any,
      },
    );
    const sessionId = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, ...deviceClaim },
      {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.cfg.getOrThrow('JWT_REFRESH_EXPIRES_IN') as any,
      },
    );
    const expiresAt = new Date(Date.now() + 30 * 864e5);
    await this.db.refreshSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        deviceId,
        tokenHash: await argon2.hash(refreshToken),
        expiresAt,
      },
    });
    return { accessToken, refreshToken };
  }

  private approvalRequired(device: { id: string; approvalExpiresAt: Date | null }, approvalToken: string): never {
    throw new HttpException(
      {
        code: 'DEVICE_APPROVAL_REQUIRED',
        message: 'Approve this device from your primary device before signing in.',
        deviceId: device.id,
        approvalToken,
        expiresAt: device.approvalExpiresAt,
      },
      HttpStatus.ACCEPTED,
    );
  }

  private async createOrRefreshPendingDevice(
    userId: string,
    login: LoginDto,
    existing?: { id: string } | null,
  ): Promise<never> {
    const approvalToken = randomBytes(32).toString('base64url');
    const approvalExpiresAt = new Date(Date.now() + AuthService.approvalTtlMs);
    const approvalChallengeHash = await argon2.hash(approvalToken);
    const data = {
      deviceName: login.deviceName,
      platform: login.platform,
      isPrimary: false,
      isApproved: false,
      revokedAt: null,
      approvalChallengeHash,
      approvalExpiresAt,
      lastSeenAt: new Date(),
    };
    const device = existing
      ? await this.db.userDevice.update({ where: { id: existing.id }, data })
      : await this.db.userDevice.create({
          data: { userId, installationId: login.installationId!, ...data },
        });
    return this.approvalRequired(device, approvalToken);
  }

  private async loginStudentDevice(user: AuthUser, login: LoginDto) {
    const installationId = login.installationId!;
    const existing = await this.db.userDevice.findUnique({
      where: { userId_installationId: { userId: user.id, installationId } },
    });

    if (existing?.isApproved && !existing.revokedAt) {
      await this.db.userDevice.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), deviceName: login.deviceName, platform: login.platform },
      });
      return this.issue(user, existing.id);
    }

    const approvedDeviceCount = await this.db.userDevice.count({
      where: { userId: user.id, isApproved: true, revokedAt: null },
    });

    if (approvedDeviceCount === 0) {
      const now = new Date();
      const device = existing
        ? await this.db.userDevice.update({
            where: { id: existing.id },
            data: {
              deviceName: login.deviceName,
              platform: login.platform,
              isPrimary: true,
              isApproved: true,
              approvedAt: now,
              revokedAt: null,
              approvalChallengeHash: null,
              approvalExpiresAt: null,
              lastSeenAt: now,
            },
          })
        : await this.db.userDevice.create({
            data: {
              userId: user.id,
              installationId,
              deviceName: login.deviceName,
              platform: login.platform,
              isPrimary: true,
              isApproved: true,
              approvedAt: now,
            },
          });
      return this.issue(user, device.id);
    }

    if (approvedDeviceCount >= AuthService.maxApprovedStudentDevices) {
      throw new ForbiddenException({
        code: 'DEVICE_LIMIT_REACHED',
        message: 'This account already has two approved devices.',
      });
    }

    return this.createOrRefreshPendingDevice(user.id, login, existing);
  }

  async register(dto: RegisterDto) {
    if (await this.db.user.findUnique({ where: { email: dto.email } })) {
      throw new ConflictException('Email already registered');
    }
    this.requireValidStudentInstallation(dto.installationId);
    const role = await this.db.role.findUniqueOrThrow({
      where: { name: RoleName.STUDENT },
    });
    const now = new Date();
    const user = await this.db.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash: await argon2.hash(dto.password),
        roles: { create: { roleId: role.id } },
        studentProfile: { create: { fullName: dto.fullName } },
        devices: {
          create: {
            installationId: dto.installationId!,
            deviceName: dto.deviceName,
            platform: dto.platform,
            isPrimary: true,
            isApproved: true,
            approvedAt: now,
          },
        },
      },
      include: { roles: { include: { role: true } }, devices: true },
    });
    return this.issue(user, user.devices[0].id);
  }

  async login(dto: LoginDto) {
    const user = await this.db.user.findUnique({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (this.isStudent(user)) {
      this.requireValidStudentInstallation(dto.installationId);
      return this.loginStudentDevice(user, dto);
    }
    return this.issue(user);
  }

  async refresh(token: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string; did?: string }>(token, {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      });
      const session = await this.db.refreshSession.findUnique({
        where: { id: payload.sid },
        include: { user: { include: { roles: { include: { role: true } } } }, device: true },
      });
      if (!session || session.revokedAt || session.expiresAt < new Date() || !(await argon2.verify(session.tokenHash, token))) {
        throw new Error();
      }
      if (
        session.deviceId &&
        (payload.did !== session.deviceId ||
          !session.device ||
          !session.device.isApproved ||
          session.device.revokedAt)
      ) {
        throw new UnauthorizedException({ code: 'DEVICE_NOT_APPROVED', message: 'This device is no longer approved.' });
      }
      if (!session.deviceId && payload.did) {
        throw new UnauthorizedException({ code: 'DEVICE_NOT_APPROVED', message: 'The refresh session device binding is invalid.' });
      }
      await this.db.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      return this.issue(session.user, session.deviceId ?? undefined);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, token?: string) {
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sid: string }>(token, {
          secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
        });
        await this.db.refreshSession.updateMany({
          where: { id: payload.sid, userId },
          data: { revokedAt: new Date() },
        });
      } catch {
        // Logout remains idempotent for expired or already-rotated refresh tokens.
      }
    }
  }

  async listDevices(userId: string) {
    return this.db.userDevice.findMany({
      where: { userId },
      select: publicDeviceSelect,
      orderBy: [{ isPrimary: 'desc' }, { firstSeenAt: 'asc' }],
    });
  }

  async approveDevice(userId: string, primaryDeviceId: string | undefined, deviceId: string, dto: ApproveDeviceDto) {
    if (!primaryDeviceId) {
      throw new ForbiddenException({ code: 'DEVICE_NOT_APPROVED', message: 'This session is not bound to a primary device.' });
    }
    const primary = await this.db.userDevice.findFirst({
      where: { id: primaryDeviceId, userId, isPrimary: true, isApproved: true, revokedAt: null },
    });
    if (!primary) {
      throw new ForbiddenException({ code: 'DEVICE_NOT_APPROVED', message: 'Only the current primary device can approve another device.' });
    }
    const pending = await this.db.userDevice.findFirst({
      where: { id: deviceId, userId, isApproved: false, revokedAt: null },
    });
    if (!pending) {
      throw new NotFoundException('Pending device not found');
    }
    if (!pending.approvalExpiresAt || pending.approvalExpiresAt < new Date()) {
      throw new GoneException({ code: 'APPROVAL_EXPIRED', message: 'The device approval request has expired.' });
    }
    if (!pending.approvalChallengeHash || !(await argon2.verify(pending.approvalChallengeHash, dto.approvalToken))) {
      throw new ForbiddenException({ code: 'DEVICE_NOT_APPROVED', message: 'The approval token is invalid.' });
    }
    const approvedDeviceCount = await this.db.userDevice.count({ where: { userId, isApproved: true, revokedAt: null } });
    if (approvedDeviceCount >= AuthService.maxApprovedStudentDevices) {
      throw new ForbiddenException({ code: 'DEVICE_LIMIT_REACHED', message: 'This account already has two approved devices.' });
    }
    return this.db.userDevice.update({
      where: { id: pending.id },
      data: { isApproved: true, approvedAt: new Date(), approvalChallengeHash: null, approvalExpiresAt: null, lastSeenAt: new Date() },
      select: publicDeviceSelect,
    });
  }

  async revokeDevice(userId: string, deviceId: string) {
    const device = await this.db.userDevice.findFirst({ where: { id: deviceId, userId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    const revokedAt = new Date();
    await this.db.refreshSession.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt },
    });
    await this.db.userDevice.update({
      where: { id: device.id },
      data: { isApproved: false, isPrimary: false, revokedAt, approvalChallengeHash: null, approvalExpiresAt: null },
    });
    if (device.isPrimary) {
      const fallback = await this.db.userDevice.findFirst({
        where: { userId, id: { not: device.id }, isApproved: true, revokedAt: null },
        orderBy: { approvedAt: 'asc' },
      });
      if (fallback) {
        await this.db.userDevice.update({ where: { id: fallback.id }, data: { isPrimary: true } });
      }
    }
  }

  async me(id: string) {
    return this.db.user.findUnique({
      where: { id },
      select: { id: true, email: true, phone: true, roles: { select: { role: { select: { name: true } } } }, studentProfile: true },
    });
  }
}
