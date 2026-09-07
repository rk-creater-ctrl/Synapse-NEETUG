import { ConflictException, ForbiddenException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthService } from './auth.service';

jest.mock('argon2', () => ({
  hash: jest.fn(async () => 'hash'),
  verify: jest.fn(async (_: string, value: string) => value === 'correct'),
}));

describe('AuthService', () => {
  const config = { getOrThrow: jest.fn((key: string) => key.includes('EXPIRES') ? '15m' : 'x'.repeat(32)) } as any;
  const jwt = { signAsync: jest.fn(async () => 'token'), verifyAsync: jest.fn() } as any;
  const db: any = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    role: { findUniqueOrThrow: jest.fn() },
    refreshSession: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    userDevice: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const service = new AuthService(db, jwt, config);
  const student = { id: 'student-1', isActive: true, passwordHash: 'hash', roles: [{ role: { name: RoleName.STUDENT } }] };
  const admin = { id: 'admin-1', isActive: true, passwordHash: 'hash', roles: [{ role: { name: RoleName.ADMIN } }] };

  beforeEach(() => jest.clearAllMocks());

  it('registers a student with a primary approved device and bound initial session', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.role.findUniqueOrThrow.mockResolvedValue({ id: 'student' });
    db.user.create.mockResolvedValue({ id: 'u', roles: [{ role: { name: RoleName.STUDENT } }], devices: [{ id: 'device-1' }] });
    await service.register({ email: 's@test.com', password: 'correct', fullName: 'Student', installationId: 'installation-0001', deviceName: 'Android device', platform: 'android' });
    expect(db.user.create.mock.calls[0][0].data.roles.create.roleId).toBe('student');
    expect(db.user.create.mock.calls[0][0].data.devices.create).toEqual(expect.objectContaining({
      installationId: 'installation-0001',
      isPrimary: true,
      isApproved: true,
    }));
    expect(db.refreshSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u', deviceId: 'device-1' }),
    }));
  });

  it('rejects duplicate email', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u' });
    await expect(service.register({ email: 's@test.com', password: 'correct', fullName: 'Student' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects student registration without an installation ID', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(service.register({ email: 's@test.com', password: 'correct', fullName: 'Student' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSTALLATION_ID_REQUIRED' }),
    });
  });

  it('rejects student registration with a malformed installation ID', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(service.register({ email: 's@test.com', password: 'correct', fullName: 'Student', installationId: 'not valid!' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSTALLATION_ID_REQUIRED' }),
    });
  });

  it('rejects invalid login and inactive users', async () => {
    db.user.findUnique.mockResolvedValue({ isActive: false, passwordHash: 'hash' });
    await expect(service.login({ email: 'x@test.com', password: 'bad' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('auto-approves and binds the first student device', async () => {
    db.user.findUnique.mockResolvedValue(student);
    db.userDevice.findUnique.mockResolvedValue(null);
    db.userDevice.count.mockResolvedValue(0);
    db.userDevice.create.mockResolvedValue({ id: 'device-1' });
    await service.login({ email: 's@test.com', password: 'correct', installationId: 'installation-0001' });
    expect(db.userDevice.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isPrimary: true, isApproved: true }) }));
    expect(db.refreshSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deviceId: 'device-1' }) }));
  });

  it('allows an existing approved student device to log in normally', async () => {
    db.user.findUnique.mockResolvedValue(student);
    db.userDevice.findUnique.mockResolvedValue({ id: 'device-1', isApproved: true, revokedAt: null });
    await expect(service.login({ email: 's@test.com', password: 'correct', installationId: 'installation-0001' })).resolves.toEqual({ accessToken: 'token', refreshToken: 'token' });
  });

  it('rejects student login without an installation ID', async () => {
    db.user.findUnique.mockResolvedValue(student);
    await expect(service.login({ email: 's@test.com', password: 'correct' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSTALLATION_ID_REQUIRED' }),
    });
  });

  it('rejects student login with a malformed installation ID', async () => {
    db.user.findUnique.mockResolvedValue(student);
    await expect(service.login({ email: 's@test.com', password: 'correct', installationId: '                ' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSTALLATION_ID_REQUIRED' }),
    });
  });

  it('uses the same generic response for unknown credentials', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(service.login({ email: 'missing@test.com', password: 'wrong-password' })).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'Invalid email or password' }),
    });
  });

  it('puts the second student device into pending approval', async () => {
    db.user.findUnique.mockResolvedValue(student);
    db.userDevice.findUnique.mockResolvedValue(null);
    db.userDevice.count.mockResolvedValue(1);
    db.userDevice.create.mockResolvedValue({ id: 'device-2', approvalExpiresAt: new Date(Date.now() + 60_000) });
    await expect(service.login({ email: 's@test.com', password: 'correct', installationId: 'installation-0002' })).rejects.toMatchObject({ status: 202, response: expect.objectContaining({ code: 'DEVICE_APPROVAL_REQUIRED' }) });
  });

  it('blocks a third unknown student device when two are approved', async () => {
    db.user.findUnique.mockResolvedValue(student);
    db.userDevice.findUnique.mockResolvedValue(null);
    db.userDevice.count.mockResolvedValue(2);
    await expect(service.login({ email: 's@test.com', password: 'correct', installationId: 'installation-0003' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not apply device restrictions to non-student roles', async () => {
    db.user.findUnique.mockResolvedValue(admin);
    await service.login({ email: 'a@test.com', password: 'correct', installationId: 'installation-0001' });
    expect(db.userDevice.findUnique).not.toHaveBeenCalled();
    expect(db.refreshSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deviceId: undefined }) }));
  });

  it('rejects approval attempts from a non-primary device', async () => {
    db.userDevice.findFirst.mockResolvedValue(null);
    await expect(service.approveDevice('student-1', 'secondary-device', 'pending-device', { approvalToken: 'x'.repeat(32) })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('approves a pending device only with a primary device and valid challenge', async () => {
    db.userDevice.findFirst
      .mockResolvedValueOnce({ id: 'primary-device' })
      .mockResolvedValueOnce({ id: 'pending-device', approvalExpiresAt: new Date(Date.now() + 60_000), approvalChallengeHash: 'hash' });
    db.userDevice.count.mockResolvedValue(1);
    db.userDevice.update.mockResolvedValue({ id: 'pending-device', isApproved: true });
    await service.approveDevice('student-1', 'primary-device', 'pending-device', { approvalToken: 'correct' });
    expect(db.userDevice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isApproved: true, approvalChallengeHash: null }) }));
  });

  it('rejects a refresh token whose bound device was revoked', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'student-1', sid: 'session-1', did: 'device-1' });
    db.refreshSession.findUnique.mockResolvedValue({ id: 'session-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000), tokenHash: 'hash', deviceId: 'device-1', device: { isApproved: false, revokedAt: new Date() }, user: student });
    await expect(service.refresh('correct')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a refresh token whose bound device is no longer approved', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'student-1', sid: 'session-1', did: 'device-1' });
    db.refreshSession.findUnique.mockResolvedValue({ id: 'session-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000), tokenHash: 'hash', deviceId: 'device-1', device: { isApproved: false, revokedAt: null }, user: student });
    await expect(service.refresh('correct')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DEVICE_NOT_APPROVED' }),
    });
  });

  it('rejects an expired approval challenge', async () => {
    db.userDevice.findFirst
      .mockResolvedValueOnce({ id: 'primary-device' })
      .mockResolvedValueOnce({ id: 'pending-device', approvalExpiresAt: new Date(Date.now() - 60_000), approvalChallengeHash: 'hash' });
    await expect(service.approveDevice('student-1', 'primary-device', 'pending-device', { approvalToken: 'correct' })).rejects.toBeInstanceOf(GoneException);
  });

  it('does not select approval challenge hashes in public device responses', async () => {
    db.userDevice.findMany.mockResolvedValue([]);
    await service.listDevices('student-1');
    const select = db.userDevice.findMany.mock.calls[0][0].select;
    expect(select.approvalChallengeHash).toBeUndefined();
  });

  it('revokes every active refresh session belonging to a device', async () => {
    db.userDevice.findFirst
      .mockResolvedValueOnce({ id: 'device-2', userId: 'student-1', isPrimary: false })
      .mockResolvedValueOnce(null);
    await service.revokeDevice('student-1', 'device-2');
    expect(db.refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'student-1', deviceId: 'device-2', revokedAt: null }) }));
  });

  it('does not allow a user to manage another user device', async () => {
    db.userDevice.findFirst.mockResolvedValue(null);
    await expect(service.revokeDevice('student-1', 'another-user-device')).rejects.toBeInstanceOf(NotFoundException);
  });
});
