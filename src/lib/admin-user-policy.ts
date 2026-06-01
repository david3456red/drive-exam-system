import type { UserStatus } from '@/lib/enums';

const SUPER_ADMIN_ROLE = 'super_admin';

export function canAssignRole(input: {
  actorRoleCode: string;
  targetRoleCode: string;
}): boolean {
  return input.targetRoleCode !== SUPER_ADMIN_ROLE || input.actorRoleCode === SUPER_ADMIN_ROLE;
}

export function canManageUserRole(input: {
  actorRoleCode: string;
  targetRoleCode: string;
}): boolean {
  return input.targetRoleCode !== SUPER_ADMIN_ROLE || input.actorRoleCode === SUPER_ADMIN_ROLE;
}

export function buildStatusUpdateData(
  currentStatus: string,
  nextStatus: UserStatus,
): {
  status: UserStatus;
  lastLoginIp?: null;
  lastLoginDeviceId?: null;
} {
  if (currentStatus === 'FROZEN' && nextStatus === 'ACTIVE') {
    return {
      status: nextStatus,
      lastLoginIp: null,
      lastLoginDeviceId: null,
    };
  }
  return { status: nextStatus };
}
