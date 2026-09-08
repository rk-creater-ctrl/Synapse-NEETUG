import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ContentManagementRoles } from './content-management-roles.decorator';
import { RolesGuard } from '../guards/roles.guard';

class ContentControllerFixture {
  @ContentManagementRoles()
  manage() {}
}

class UnrestrictedControllerFixture {
  read() {}
}

const contextFor = (
  roles: RoleName[],
  handler: Function,
  controller: Function,
) => ({
  getHandler: () => handler,
  getClass: () => controller,
  switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
}) as unknown as ExecutionContext;

describe('ContentManagementRoles', () => {
  const guard = new RolesGuard(new Reflector());
  const contentHandler = ContentControllerFixture.prototype.manage;

  it.each([
    RoleName.CONTENT_EDITOR,
    RoleName.ADMIN,
    RoleName.SUPER_ADMIN,
  ])('allows %s to manage content', (role) => {
    expect(
      guard.canActivate(
        contextFor([role], contentHandler, ContentControllerFixture),
      ),
    ).toBe(true);
  });

  it.each([
    RoleName.STUDENT,
    RoleName.MENTOR,
    RoleName.MODERATOR,
    RoleName.SUPPORT,
  ])('denies %s from managing content', (role) => {
    expect(
      guard.canActivate(
        contextFor([role], contentHandler, ContentControllerFixture),
      ),
    ).toBe(false);
  });

  it('preserves existing behavior for routes without role metadata', () => {
    expect(
      guard.canActivate(
        contextFor([], UnrestrictedControllerFixture.prototype.read, UnrestrictedControllerFixture),
      ),
    ).toBe(true);
  });
});
