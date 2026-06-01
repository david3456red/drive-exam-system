import { describe, expect, it } from 'vitest';

import {
  canAssignRole,
  canManageUserRole,
  buildStatusUpdateData,
} from '@/lib/admin-user-policy';

describe('admin user policy', () => {
  it('prevents non-super admins from assigning super_admin', () => {
    expect(canAssignRole({ actorRoleCode: 'admin', targetRoleCode: 'super_admin' })).toBe(false);
    expect(canAssignRole({ actorRoleCode: 'super_admin', targetRoleCode: 'super_admin' })).toBe(true);
  });

  it('prevents non-super admins from managing existing super_admin users', () => {
    expect(canManageUserRole({ actorRoleCode: 'admin', targetRoleCode: 'super_admin' })).toBe(false);
    expect(canManageUserRole({ actorRoleCode: 'super_admin', targetRoleCode: 'super_admin' })).toBe(true);
  });

  it('clears strict-login baseline when a frozen user is reactivated', () => {
    expect(buildStatusUpdateData('FROZEN', 'ACTIVE')).toEqual({
      status: 'ACTIVE',
      lastLoginIp: null,
      lastLoginDeviceId: null,
    });
  });
});
