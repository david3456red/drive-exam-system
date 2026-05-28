/**
 * Property-based tests for `src/lib/permissions.ts`.
 *
 * Validates Requirements 2.1:
 *   2.1 — WHEN Auth_System resolves the current user role, IF the role code equals
 *         `super_admin`, THEN the permission check SHALL return "all permissions"
 *         and ignore the actual contents of `RolePermission`.
 *
 * Framework: Vitest + fast-check.
 *
 * Property catalog implemented in this file:
 *   - super_admin returns true for any permission code (incl. arbitrary strings),
 *     regardless of `permissionCodes` content (Requirement 2.1, named property).
 *   - super_admin short-circuits even when `permissionCodes` is empty
 *     (proves precedence: roleCode short-circuit happens before `.includes`).
 *   - Non-super-admin: `hasPermission` returns true iff `permissionCodes.includes(code)`.
 *   - `null` / `undefined` session returns false (defensive contract).
 *   - `requirePermission` throws `UnauthorizedError` exactly when `hasPermission`
 *     returns false, and the thrown error carries the queried `code`.
 *
 * `numRuns` is set to 100 (≥ 50 required by the task) to sweep a generous slice
 * of the input space across known + arbitrary permission codes.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
    ALL_PERMISSION_CODES,
    hasPermission,
    requirePermission,
    UnauthorizedError,
    type PermissionCode,
    type SessionLike,
} from '@/lib/permissions';

const NUM_RUNS = 100;

// -------------------------------------------------------------------------------------
// Generators
// -------------------------------------------------------------------------------------

/**
 * Mix of "real" permission codes drawn from the canonical 30-code list and totally
 * arbitrary strings. Casting through `PermissionCode` matches how real callers
 * invoke `hasPermission`; at runtime the function operates on plain strings and
 * the type annotation is only a compile-time guide.
 */
const anyPermissionCode = (): fc.Arbitrary<PermissionCode> =>
  fc.oneof(
    fc.constantFrom(...ALL_PERMISSION_CODES),
    fc.string().map((s) => s as PermissionCode),
  );

/**
 * Generator for a non-super-admin role code. We constrain the alphabet so the
 * shrunk counterexamples remain readable, but we still emit empty strings and
 * exotic role names to make sure the comparison `=== 'super_admin'` is treated
 * literally (no case-insensitive / trimmed matching).
 */
const nonSuperAdminRoleCode = (): fc.Arbitrary<string> =>
  fc
    .oneof(
      fc.constantFrom('admin', 'teacher', 'student_strict', 'student_normal'),
      fc.string(),
    )
    .filter((s) => s !== 'super_admin');

/** Generator for a `permissionCodes` array; empty arrays are allowed. */
const permissionCodesArray = (): fc.Arbitrary<string[]> =>
  fc.array(
    fc.oneof(fc.constantFrom(...ALL_PERMISSION_CODES), fc.string()),
    { maxLength: 16 },
  );

/** Build a structurally valid session object for the given fields. */
const makeSession = (
  roleCode: string,
  permissionCodes: readonly string[],
): NonNullable<SessionLike> => ({
  user: { id: 'u-test', roleCode, permissionCodes },
});

// -------------------------------------------------------------------------------------
// Properties
// -------------------------------------------------------------------------------------

describe('permissions.ts — property-based tests', () => {
  describe('Property: super_admin 全权限 (Requirement 2.1)', () => {
    it('hasPermission returns true for any permission code when roleCode === "super_admin"', () => {
      fc.assert(
        fc.property(
          anyPermissionCode(),
          permissionCodesArray(),
          (code, codes) => {
            const session = makeSession('super_admin', codes);
            expect(hasPermission(session, code)).toBe(true);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('super_admin short-circuits even when permissionCodes is empty (precedence over .includes)', () => {
      fc.assert(
        fc.property(anyPermissionCode(), (code) => {
          const session = makeSession('super_admin', []);
          // If the implementation were to consult `.includes` first (or in
          // addition), an empty array would yield `false` for any code that
          // happens not to be present — which would fail this assertion and
          // surface the bug.
          expect(hasPermission(session, code)).toBe(true);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('requirePermission never throws for super_admin regardless of permissionCodes', () => {
      fc.assert(
        fc.property(
          anyPermissionCode(),
          permissionCodesArray(),
          (code, codes) => {
            const session = makeSession('super_admin', codes);
            expect(() => requirePermission(session, code)).not.toThrow();
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('Property: 非 super_admin 角色按 includes 比对', () => {
    it('returns true iff permissionCodes contains the queried code', () => {
      fc.assert(
        fc.property(
          nonSuperAdminRoleCode(),
          permissionCodesArray(),
          anyPermissionCode(),
          (roleCode, codes, queried) => {
            const session = makeSession(roleCode, codes);
            const expected = codes.includes(queried);
            expect(hasPermission(session, queried)).toBe(expected);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('positive case: when permissionCodes definitely contains the code, returns true', () => {
      // Construct a granted code by sampling from the actual `permissionCodes`
      // array — guarantees the `.includes` branch returns true.
      fc.assert(
        fc.property(
          nonSuperAdminRoleCode(),
          fc
            .array(
              fc.oneof(
                fc.constantFrom(...ALL_PERMISSION_CODES),
                fc.string(),
              ),
              { minLength: 1, maxLength: 16 },
            )
            .chain((codes) =>
              fc.tuple(fc.constant(codes), fc.constantFrom(...codes)),
            ),
          (roleCode, [codes, granted]) => {
            const session = makeSession(roleCode, codes);
            expect(hasPermission(session, granted as PermissionCode)).toBe(
              true,
            );
            expect(() =>
              requirePermission(session, granted as PermissionCode),
            ).not.toThrow();
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it('negative case: when permissionCodes does not contain the code, returns false', () => {
      // Explicitly exclude the queried code from the granted list to force the
      // `.includes` branch to return false.
      fc.assert(
        fc.property(
          nonSuperAdminRoleCode(),
          permissionCodesArray(),
          anyPermissionCode(),
          (roleCode, codes, queried) => {
            const filtered = codes.filter((c) => c !== queried);
            const session = makeSession(roleCode, filtered);
            expect(hasPermission(session, queried)).toBe(false);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('Property: null / undefined session', () => {
    it('hasPermission returns false for null session, regardless of code', () => {
      fc.assert(
        fc.property(anyPermissionCode(), (code) => {
          expect(hasPermission(null, code)).toBe(false);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('hasPermission returns false for undefined session, regardless of code', () => {
      fc.assert(
        fc.property(anyPermissionCode(), (code) => {
          expect(hasPermission(undefined, code)).toBe(false);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('Property: requirePermission throw 语义', () => {
    it('throws UnauthorizedError carrying the queried code iff hasPermission returns false', () => {
      // Sweep across the union of all session shapes (null/undefined +
      // arbitrary roles + arbitrary permission arrays) and assert the
      // bidirectional relationship between hasPermission and requirePermission.
      const sessionArb = fc.oneof(
        fc.constant(null) as fc.Arbitrary<SessionLike>,
        fc.constant(undefined) as fc.Arbitrary<SessionLike>,
        fc
          .tuple(
            fc.oneof(
              fc.constant('super_admin'),
              nonSuperAdminRoleCode(),
            ),
            permissionCodesArray(),
          )
          .map(
            ([roleCode, codes]) => makeSession(roleCode, codes) as SessionLike,
          ),
      );

      fc.assert(
        fc.property(sessionArb, anyPermissionCode(), (session, code) => {
          const allowed = hasPermission(session, code);
          if (allowed) {
            expect(() => requirePermission(session, code)).not.toThrow();
          } else {
            try {
              requirePermission(session, code);
              // If we reach this line, requirePermission failed to throw —
              // surface that as an explicit assertion failure so fast-check
              // shrinks the offending input.
              expect.fail(
                'requirePermission should have thrown UnauthorizedError but did not',
              );
            } catch (err) {
              expect(err).toBeInstanceOf(UnauthorizedError);
              expect((err as UnauthorizedError).code).toBe(code);
              expect((err as UnauthorizedError).name).toBe('UnauthorizedError');
            }
          }
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });
});
