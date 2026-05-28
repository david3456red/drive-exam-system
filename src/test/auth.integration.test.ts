/**
 * Integration / property-based tests for `loginPipeline` (`src/lib/auth-pipeline.ts`).
 *
 * Backed by a real Prisma + SQLite database (configured via
 * `vitest.integration.config.ts` to `file:./test.db`); each property
 * resets the shared state on every iteration so iterations are independent
 * even though the underlying DB is shared.
 *
 * Test framework: Vitest + fast-check (per Requirement 29.1).
 *
 * Properties implemented (each `numRuns >= 50`):
 *
 *   1. **缺失 deviceId 永远拒绝** — Any input with `deviceId === ''` returns
 *      `null` AND writes a single `LoginLog` with `reason='DEVICE_FINGERPRINT_MISSING'`
 *      regardless of username/password/ip (Requirement 6.3, 6.4, 8.1, 8.2).
 *
 *   2. **异地登录冻结** — When `role.strictLogin=true` and a baseline already
 *      exists, any subsequent login with **either** a different IP **or** a
 *      different deviceId flips `User.status` to `FROZEN`, returns `null`, and
 *      writes a `FROZEN_BY_REMOTE` log (Requirement 7.1, 7.3, 8.2).
 *
 *   3. **strictLogin=false 不比对** — For roles whose `strictLogin=false`
 *      (`student_normal`, `teacher`, `admin`), arbitrary new IP / deviceId
 *      values still produce a successful login, the user stays `ACTIVE`, and
 *      the log records `OK` (Requirement 7.3).
 *
 *   4. **LoginLog 写入完整性** — For arbitrary inputs the call writes
 *      **exactly one** LoginLog and its `reason` is in the `LOGIN_REASONS`
 *      enum, no matter which decision branch was taken (Requirement 8.1, 8.2).
 *
 * **Validates: Requirements 6.3, 7.1, 7.3, 8.1, 8.2**
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import * as bcrypt from 'bcryptjs';
import fc from 'fast-check';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginPipeline } from '@/lib/auth-pipeline';
import { prisma } from '@/lib/db';
import { LOGIN_REASONS } from '@/lib/enums';

// =============================================================================
// Tunables
// =============================================================================

const NUM_RUNS = 50;

/**
 * Plaintext shared by all test users — kept alongside its 4-round bcrypt hash
 * so `bcrypt.compare` stays fast. 4 rounds is intentionally cheaper than the
 * production 10 rounds; correctness of the comparison is identical.
 */
const TEST_PASSWORD = 'Test@123';
let TEST_PASSWORD_HASH = '';

/**
 * Baseline IP / device fingerprint used when a property needs to pre-establish
 * "this user has logged in once already". Both values are guaranteed to be
 * stable, non-empty, whitespace-free strings so they survive `auth-pipeline`'s
 * `(input ?? '').trim()` normalization.
 */
const BASE_IP = '10.0.0.1';
const BASE_DEVICE = 'device-baseline';

// =============================================================================
// Test fixtures (created in beforeAll, immutable across iterations)
// =============================================================================

type SeededUser = {
  id: string;
  username: string;
  roleCode: string;
  strictLogin: boolean;
};

let strictStudent: SeededUser;
let normalStudent: SeededUser;
let teacherUser: SeededUser;
let adminUser: SeededUser;

// =============================================================================
// fast-check generators
// =============================================================================

/** Strings that contain at least one non-whitespace char (survive `trim()`). */
const arbNonEmptyTrimmed = fc
  .string({ minLength: 1, maxLength: 32 })
  .filter((s) => s.trim().length > 0);

/**
 * Strings guaranteed to differ from `BASE_IP` / `BASE_DEVICE` after trimming.
 * The literal "DIFF-" prefix sidesteps the (very rare) chance that a random
 * generator could happen to produce the baseline literal.
 */
const arbDifferentString = fc
  .string({ maxLength: 32 })
  .map((s) => `DIFF-${s.trim()}`)
  .filter((s) => s !== BASE_IP && s !== BASE_DEVICE);

/** Arbitrary username (not necessarily existing) for the LoginLog completeness test. */
const arbAnyUsername = fc.oneof(
  fc.constantFrom(
    'strict_user',
    'normal_user',
    'teacher_user',
    'admin_user',
    'nonexistent',
    '',
  ),
  fc.string({ maxLength: 24 }),
);

// =============================================================================
// Helpers
// =============================================================================

/**
 * Bring the shared DB back to a known empty + ACTIVE state. Called before
 * `loginPipeline` is invoked inside each fast-check iteration so iterations
 * do not leak state into each other.
 */
async function resetUsersAndLogs(): Promise<void> {
  await prisma.loginLog.deleteMany({});
  await prisma.user.updateMany({
    data: {
      status: 'ACTIVE',
      lastLoginIp: null,
      lastLoginDeviceId: null,
    },
  });
}

/** Pre-establish the "已登录过一次" baseline for a specific user. */
async function setBaseline(userId: string): Promise<void> {
  await prisma.loginLog.deleteMany({});
  await prisma.user.update({
    where: { id: userId },
    data: {
      status: 'ACTIVE',
      lastLoginIp: BASE_IP,
      lastLoginDeviceId: BASE_DEVICE,
    },
  });
}

// =============================================================================
// beforeAll — provision schema + seed minimal RBAC + 4 test users
// =============================================================================

beforeAll(async () => {
  // 1. Apply the latest Prisma schema to test.db, force-resetting any pre-existing
  //    state. `--accept-data-loss` is required because force-reset drops all
  //    tables. The subprocess has its own CWD/env so we explicitly forward
  //    DATABASE_URL even though `vitest.integration.config.ts` already sets it.
  ensureTestDatabaseFile();
  execSync(
    'pnpm exec prisma db push --force-reset --skip-generate --accept-data-loss',
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: 'file:./test.db' },
      stdio: 'pipe',
    },
  );

  // 2. Hash the shared password once (low-cost rounds, see TUNABLES note).
  TEST_PASSWORD_HASH = await bcrypt.hash(TEST_PASSWORD, 4);

  // 3. Roles — only the four needed by the four properties.
  const roleStrict = await prisma.role.create({
    data: {
      code: 'student_strict',
      name: '严格学员',
      strictLogin: true, // Requirement 1.5
      isSystem: true,
    },
  });
  const roleNormal = await prisma.role.create({
    data: {
      code: 'student_normal',
      name: '普通学员',
      strictLogin: false,
      isSystem: true,
    },
  });
  const roleTeacher = await prisma.role.create({
    data: {
      code: 'teacher',
      name: '教练',
      strictLogin: false,
      isSystem: true,
    },
  });
  const roleAdmin = await prisma.role.create({
    data: {
      code: 'admin',
      name: '管理员',
      strictLogin: false,
      isSystem: true,
    },
  });

  // 4. Test users — one per role, all sharing TEST_PASSWORD.
  const created = await Promise.all([
    prisma.user.create({
      data: {
        username: 'strict_user',
        passwordHash: TEST_PASSWORD_HASH,
        name: '严格学员-测试',
        roleId: roleStrict.id,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        username: 'normal_user',
        passwordHash: TEST_PASSWORD_HASH,
        name: '普通学员-测试',
        roleId: roleNormal.id,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        username: 'teacher_user',
        passwordHash: TEST_PASSWORD_HASH,
        name: '教练-测试',
        roleId: roleTeacher.id,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        username: 'admin_user',
        passwordHash: TEST_PASSWORD_HASH,
        name: '管理员-测试',
        roleId: roleAdmin.id,
        status: 'ACTIVE',
      },
    }),
  ]);

  strictStudent = {
    id: created[0].id,
    username: created[0].username,
    roleCode: 'student_strict',
    strictLogin: true,
  };
  normalStudent = {
    id: created[1].id,
    username: created[1].username,
    roleCode: 'student_normal',
    strictLogin: false,
  };
  teacherUser = {
    id: created[2].id,
    username: created[2].username,
    roleCode: 'teacher',
    strictLogin: false,
  };
  adminUser = {
    id: created[3].id,
    username: created[3].username,
    roleCode: 'admin',
    strictLogin: false,
  };
});

function ensureTestDatabaseFile(): void {
  const testDbPath = path.join(process.cwd(), 'prisma', 'test.db');
  mkdirSync(path.dirname(testDbPath), { recursive: true });
  if (!existsSync(testDbPath)) {
    writeFileSync(testDbPath, '');
  }
}

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetUsersAndLogs();
});

// =============================================================================
// Properties
// =============================================================================

describe('loginPipeline — integration & property-based tests', () => {
  describe('Property 1: 缺失 deviceId 永远拒绝 (Requirement 6.3, 6.4)', () => {
    it('any input with deviceId === "" returns null and writes DEVICE_FINGERPRINT_MISSING', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAnyUsername,
          fc.string({ maxLength: 24 }),
          arbNonEmptyTrimmed,
          async (username, password, ip) => {
            // Reset per iteration so the LoginLog count assertion is exact.
            await resetUsersAndLogs();

            const result = await loginPipeline({
              username,
              password,
              deviceId: '',
              ip,
              userAgent: null,
            });

            expect(result).toBeNull();

            const logs = await prisma.loginLog.findMany();
            expect(logs).toHaveLength(1);
            expect(logs[0]).toMatchObject({
              reason: 'DEVICE_FINGERPRINT_MISSING',
              success: false,
              // auth-pipeline writes deviceId=null when input was empty.
              deviceId: null,
            });
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('Property 2: 异地登录冻结 (Requirement 7.1)', () => {
    it('strictLogin=true + IP/Device 任一变化 → FROZEN + reject + FROZEN_BY_REMOTE log', async () => {
      // Generate three sub-cases: only IP differs, only device differs, both differ.
      const arbDeviation = fc.oneof(
        fc.record({
          ip: arbDifferentString,
          deviceId: fc.constant(BASE_DEVICE),
        }),
        fc.record({
          ip: fc.constant(BASE_IP),
          deviceId: arbDifferentString,
        }),
        fc.record({
          ip: arbDifferentString,
          deviceId: arbDifferentString,
        }),
      );

      await fc.assert(
        fc.asyncProperty(arbDeviation, async ({ ip, deviceId }) => {
          // Each iteration starts from baseline ACTIVE state.
          await setBaseline(strictStudent.id);

          const result = await loginPipeline({
            username: strictStudent.username,
            password: TEST_PASSWORD,
            deviceId,
            ip,
            userAgent: 'pbt-agent',
          });

          // 1. Login is rejected.
          expect(result).toBeNull();

          // 2. User flipped to FROZEN.
          const userAfter = await prisma.user.findUniqueOrThrow({
            where: { id: strictStudent.id },
          });
          expect(userAfter.status).toBe('FROZEN');

          // 3. Exactly one log written and it carries FROZEN_BY_REMOTE.
          const logs = await prisma.loginLog.findMany({
            orderBy: { createdAt: 'asc' },
          });
          expect(logs).toHaveLength(1);
          expect(logs[0]).toMatchObject({
            reason: 'FROZEN_BY_REMOTE',
            success: false,
            userId: strictStudent.id,
          });
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('Property 3: strictLogin=false 不比对 (Requirement 7.3)', () => {
    it('non-strict roles login successfully despite arbitrary new IP/Device', async () => {
      const arbNonStrictUser = fc.constantFrom(
        () => normalStudent,
        () => teacherUser,
        () => adminUser,
      );

      await fc.assert(
        fc.asyncProperty(
          arbNonStrictUser,
          arbDifferentString, // arbitrary new IP (different from baseline)
          arbDifferentString, // arbitrary new device (different from baseline)
          async (pickUser, newIp, newDeviceId) => {
            const target = pickUser();
            await setBaseline(target.id);

            const result = await loginPipeline({
              username: target.username,
              password: TEST_PASSWORD,
              deviceId: newDeviceId,
              ip: newIp,
              userAgent: 'pbt-agent',
            });

            // 1. Login succeeds — non-strict roles ignore IP / device drift.
            expect(result).not.toBeNull();
            expect(result?.username).toBe(target.username);
            expect(result?.roleCode).toBe(target.roleCode);

            // 2. User stays ACTIVE; baseline now mirrors the new values.
            const userAfter = await prisma.user.findUniqueOrThrow({
              where: { id: target.id },
            });
            expect(userAfter.status).toBe('ACTIVE');
            expect(userAfter.lastLoginIp).toBe(newIp);
            expect(userAfter.lastLoginDeviceId).toBe(newDeviceId);

            // 3. LoginLog records OK.
            const logs = await prisma.loginLog.findMany({
              orderBy: { createdAt: 'asc' },
            });
            expect(logs).toHaveLength(1);
            expect(logs[0]).toMatchObject({ reason: 'OK', success: true });
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe('Property 4: LoginLog 写入完整性 (Requirement 8.1, 8.2)', () => {
    it('any attempt writes exactly one log; reason is always within LOGIN_REASONS', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAnyUsername,
          fc.string({ maxLength: 24 }),
          fc.string({ maxLength: 24 }),
          arbNonEmptyTrimmed,
          async (username, password, deviceId, ip) => {
            await resetUsersAndLogs();
            const before = await prisma.loginLog.count();

            await loginPipeline({
              username,
              password,
              deviceId,
              ip,
              userAgent: null,
            });

            const after = await prisma.loginLog.count();
            expect(after - before).toBe(1);

            const latest = await prisma.loginLog.findFirst({
              orderBy: { createdAt: 'desc' },
            });
            expect(latest).not.toBeNull();
            expect(LOGIN_REASONS).toContain(latest!.reason);

            // Required columns are always populated regardless of branch.
            expect(typeof latest!.username).toBe('string');
            expect(typeof latest!.ip).toBe('string');
            expect(latest!.ip.length).toBeGreaterThan(0);
            expect(typeof latest!.success).toBe('boolean');
            // success and reason are in agreement: only 'OK' is a success log.
            if (latest!.success) {
              expect(latest!.reason).toBe('OK');
            } else {
              expect(latest!.reason).not.toBe('OK');
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });
});
