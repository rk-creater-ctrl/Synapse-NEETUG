import { RoleName } from '@prisma/client';
import { Roles } from './roles.decorator';

export const CONTENT_MANAGEMENT_ROLES = [
  RoleName.CONTENT_EDITOR,
  RoleName.ADMIN,
  RoleName.SUPER_ADMIN,
] as const;

export const ContentManagementRoles = () =>
  Roles(...CONTENT_MANAGEMENT_ROLES);
