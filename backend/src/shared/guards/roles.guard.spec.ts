import { ExecutionContext } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CONTENT_MANAGEMENT_ROLES } from '../decorators/content-management-roles.decorator';
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
  it('allows only the defined content-management roles on CMS endpoints', () => {
    reflector.getAllAndOverride.mockReturnValue(CONTENT_MANAGEMENT_ROLES);

    expect(guard.canActivate(context([RoleName.CONTENT_EDITOR]))).toBe(true);
    expect(guard.canActivate(context([RoleName.ADMIN]))).toBe(true);
    expect(guard.canActivate(context([RoleName.SUPER_ADMIN]))).toBe(true);
    expect(guard.canActivate(context([RoleName.STUDENT]))).toBe(false);
    expect(guard.canActivate(context([RoleName.MENTOR]))).toBe(false);
    expect(guard.canActivate(context([RoleName.MODERATOR]))).toBe(false);
    expect(guard.canActivate(context([RoleName.SUPPORT]))).toBe(false);
  });
});
