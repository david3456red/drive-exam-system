/**
 * 应用层枚举定义。
 *
 * SQLite Prisma connector 不支持原生 `enum` 类型,故枚举字段在 schema.prisma
 * 中以 String 列存储;运行时取值范围由本文件定义的字面量联合类型 + Zod
 * schema(各模块就地声明)+ 应用层校验共同保证。
 *
 * 本文件应作为整套系统中所有枚举的唯一事实来源,修改时同步更新 design.md。
 */

// ===== User =====
export const USER_STATUSES = ['ACTIVE', 'FROZEN', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// ===== Login =====
export const LOGIN_REASONS = [
  'OK',
  'WRONG_PASSWORD',
  'USER_NOT_FOUND',
  'FROZEN_BY_REMOTE',
  'DISABLED',
  'DEVICE_FINGERPRINT_MISSING',
] as const;
export type LoginReason = (typeof LOGIN_REASONS)[number];

// ===== Question =====
export const QUESTION_TYPES = ['SINGLE', 'MULTI', 'JUDGE'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// ===== Exam =====
export const EXAM_MODES = [
  'SEQUENTIAL',
  'RANDOM',
  'CHAPTER',
  'MOCK',
  'WRONG_REVIEW',
] as const;
export type ExamMode = (typeof EXAM_MODES)[number];

export const EXAM_STATUSES = ['ONGOING', 'FINISHED', 'ABANDONED'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];
