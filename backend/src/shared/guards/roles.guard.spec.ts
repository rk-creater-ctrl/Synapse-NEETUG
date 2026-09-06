import { ExecutionContext } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as any;
  const guard = new RolesGuard(reflector);
  const context = (roles: RoleName[]): ExecutionContext => ({
    getHandler: () => undefined, getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  } as any);
  it('allows routes without role metadata', () => { reflector.getAllAndOverride.mockReturnValue(undefined); expect(guard.canActivate(context([]))).toBe(true); });
  it('denies a student on an admin route', () => { reflector.getAllAndOverride.mockReturnValue([RoleName.ADMIN]); expect(guard.canActivate(context([RoleName.STUDENT]))).toBe(false); });
  it('allows admin and super admin roles', () => { reflector.getAllAndOverride.mockReturnValue([RoleName.ADMIN, RoleName.SUPER_ADMIN]); expect(guard.canActivate(context([RoleName.ADMIN]))).toBe(true); expect(guard.canActivate(context([RoleName.SUPER_ADMIN]))).toBe(true); });
});
