/**
 * Shared question/category types and Zod schemas.
 *
 * `Question.options` is stored in SQLite as a JSON-encoded string of
 * `{ key, text }[]`. Use `parseOptions` / `serializeOptions` to convert.
 */
import { z } from 'zod';

export const QUESTION_TYPES = ['SINGLE', 'MULTI', 'JUDGE'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_DISPLAY: Record<QuestionType, string> = {
  SINGLE: '单选',
  MULTI: '多选',
  JUDGE: '判断',
};

export type QuestionOption = { key: string; text: string };

export function parseOptions(serialized: string | null | undefined): QuestionOption[] {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((o): o is QuestionOption =>
        typeof o === 'object' && o !== null && typeof o.key === 'string' && typeof o.text === 'string',
      )
      .map((o) => ({ key: String(o.key).trim(), text: String(o.text) }));
  } catch {
    return [];
  }
}

export function serializeOptions(options: QuestionOption[]): string {
  return JSON.stringify(
    options.map((o) => ({ key: String(o.key).trim().toUpperCase(), text: String(o.text) })),
  );
}

export function parseTags(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function serializeTags(tags: string[]): string {
  return tags.map((t) => t.trim()).filter(Boolean).join(',');
}

// ---- Zod schemas ----------------------------------------------------------

const optionSchema = z.object({
  key: z.string().min(1, '选项 key 不能为空').max(2),
  text: z.string().min(1, '选项内容不能为空'),
});

/** Schema for the import payload (JSON / Excel converted to this shape). */
export const QuestionImportSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    content: z.string().min(1, '题干不能为空').max(2000),
    imageUrl: z.string().max(500).optional().nullable(),
    options: z.array(optionSchema).default([]),
    answer: z.string().min(1, '答案不能为空').max(8),
    explanation: z.string().max(2000).optional().nullable(),
    categories: z.array(z.string().min(1)).default([]),
    tags: z.array(z.string()).default([]),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'JUDGE') {
      if (!['T', 'F'].includes(q.answer.toUpperCase())) {
        ctx.addIssue({ code: 'custom', message: '判断题答案必须是 T 或 F', path: ['answer'] });
      }
      return;
    }
    // SINGLE / MULTI
    if (q.options.length < 2) {
      ctx.addIssue({ code: 'custom', message: '单选/多选至少需要 2 个选项', path: ['options'] });
    }
    const optionKeys = new Set(q.options.map((o) => o.key.toUpperCase()));
    const answer = q.answer.toUpperCase();
    if (q.type === 'SINGLE') {
      if (answer.length !== 1) {
        ctx.addIssue({ code: 'custom', message: '单选题答案必须是 1 个选项', path: ['answer'] });
      } else if (!optionKeys.has(answer)) {
        ctx.addIssue({ code: 'custom', message: `答案 "${answer}" 不在选项中`, path: ['answer'] });
      }
    } else {
      // MULTI
      if (answer.length < 2) {
        ctx.addIssue({ code: 'custom', message: '多选题答案至少 2 个选项', path: ['answer'] });
      }
      for (const ch of answer) {
        if (!optionKeys.has(ch)) {
          ctx.addIssue({
            code: 'custom',
            message: `答案中的 "${ch}" 不在选项中`,
            path: ['answer'],
          });
          break;
        }
      }
    }
  });

export type QuestionImportInput = z.infer<typeof QuestionImportSchema>;

/** Schema for single-question CRUD form (UI). */
export const QuestionFormSchema = z.object({
  bankId: z.string().min(1, '请选择题库'),
  type: z.enum(QUESTION_TYPES),
  content: z.string().min(1).max(2000),
  imageUrl: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  options: z.array(optionSchema).default([]),
  answer: z.string().min(1).max(8),
  explanation: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  categoryIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export type QuestionFormInput = z.infer<typeof QuestionFormSchema>;

// ---- Bank / category schemas ---------------------------------------------

export const BankFormSchema = z.object({
  code: z
    .string()
    .min(2, 'code 至少 2 位')
    .max(40)
    .regex(/^[a-z0-9_-]+$/, 'code 只能用小写字母 / 数字 / _ / -'),
  name: z.string().min(1, '名称不能为空').max(60),
  description: z.string().max(200).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export type BankFormInput = z.infer<typeof BankFormSchema>;

export const CategoryFormSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(60),
  parentId: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export type CategoryFormInput = z.infer<typeof CategoryFormSchema>;
