'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import {
  parseJsonImport,
  parseExcelImport,
  type RawImportItem,
} from '@/lib/import-parser';
import {
  QuestionImportSchema,
  serializeOptions,
  serializeTags,
  type QuestionImportInput,
} from '@/lib/question-types';

const MAX_ROWS = 5000;

export type ImportRowError = { rowIndex: number; reason: string };

export type ImportPreview = {
  ok: true;
  bankId: string;
  bankName: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  errors: ImportRowError[];
  samples: { rowIndex: number; preview: ValidatedItem }[];
};

export type ImportFailure = { ok: false; error: string };

export type CommitResult = {
  ok: true;
  committed: number;
  invalidSkipped: number;
  newCategories: string[];
};

type ValidatedItem = QuestionImportInput;

async function readPayload(
  fd: FormData,
): Promise<
  | { ok: true; bankId: string; rawItems: RawImportItem[] }
  | { ok: false; error: string }
> {
  const bankId = String(fd.get('bankId') ?? '').trim();
  if (!bankId) return { ok: false, error: '请选择目标题库' };

  const kind = String(fd.get('kind') ?? '').trim();
  if (kind === 'json') {
    const text = String(fd.get('text') ?? '');
    const r = parseJsonImport(text);
    if (!r.ok) return r;
    return { ok: true, bankId, rawItems: r.items };
  }
  if (kind === 'excel') {
    const file = fd.get('file');
    if (!(file instanceof File)) return { ok: false, error: '请上传 .xlsx 文件' };
    const buf = Buffer.from(await file.arrayBuffer());
    const r = parseExcelImport(buf);
    if (!r.ok) return r;
    return { ok: true, bankId, rawItems: r.items };
  }
  return { ok: false, error: '不支持的导入类型' };
}

function validate(
  rawItems: RawImportItem[],
): {
  validated: { rowIndex: number; data: ValidatedItem }[];
  errors: ImportRowError[];
} {
  const validated: { rowIndex: number; data: ValidatedItem }[] = [];
  const errors: ImportRowError[] = [];
  rawItems.forEach((row, i) => {
    const parsed = QuestionImportSchema.safeParse(row);
    if (parsed.success) {
      validated.push({ rowIndex: i + 1, data: parsed.data });
    } else {
      const msg = parsed.error.issues
        .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
        .join('; ');
      errors.push({ rowIndex: i + 1, reason: msg });
    }
  });
  return { validated, errors };
}

export async function previewImport(fd: FormData): Promise<ImportPreview | ImportFailure> {
  const session = await auth();
  if (!hasPermission(session?.user, 'question:import')) {
    return { ok: false, error: '无权限' };
  }

  const r = await readPayload(fd);
  if (!r.ok) return r;
  const { bankId, rawItems } = r;

  if (rawItems.length === 0) return { ok: false, error: '没有可导入的题目' };
  if (rawItems.length > MAX_ROWS) {
    return { ok: false, error: `单次最多导入 ${MAX_ROWS} 条,当前 ${rawItems.length} 条` };
  }

  const bank = await prisma.questionBank.findUnique({ where: { id: bankId } });
  if (!bank) return { ok: false, error: '题库不存在' };

  const { validated, errors } = validate(rawItems);

  return {
    ok: true,
    bankId,
    bankName: bank.name,
    totalRows: rawItems.length,
    validCount: validated.length,
    invalidCount: errors.length,
    errors: errors.slice(0, 50),
    samples: validated.slice(0, 5).map(({ rowIndex, data }) => ({ rowIndex, preview: data })),
  };
}

export async function commitImport(fd: FormData): Promise<CommitResult | ImportFailure> {
  const session = await auth();
  if (!hasPermission(session?.user, 'question:import')) {
    return { ok: false, error: '无权限' };
  }

  const r = await readPayload(fd);
  if (!r.ok) return r;
  const { bankId, rawItems } = r;

  if (rawItems.length === 0) return { ok: false, error: '没有可导入的题目' };
  if (rawItems.length > MAX_ROWS) {
    return { ok: false, error: `单次最多导入 ${MAX_ROWS} 条` };
  }

  const bank = await prisma.questionBank.findUnique({ where: { id: bankId } });
  if (!bank) return { ok: false, error: '题库不存在' };

  const { validated, errors } = validate(rawItems);
  if (validated.length === 0) {
    return { ok: false, error: `没有合法的题目可导入(${errors.length} 行不合法)` };
  }

  // Collect every unique category name referenced by valid items.
  const allCatNames = new Set<string>();
  for (const v of validated) {
    for (const name of v.data.categories) allCatNames.add(name);
  }

  // Upsert categories globally (categories are no longer bank-scoped).
  const newCategories: string[] = [];
  const catNameToId = new Map<string, string>();

  if (allCatNames.size > 0) {
    const existing = await prisma.category.findMany({
      where: { parentId: null, name: { in: Array.from(allCatNames) } },
      select: { id: true, name: true },
    });
    for (const c of existing) catNameToId.set(c.name, c.id);

    const missing = Array.from(allCatNames).filter((n) => !catNameToId.has(n));
    if (missing.length > 0) {
      // Create one-by-one because createMany doesn't return ids on SQLite.
      for (const name of missing) {
        const created = await prisma.category.create({
          data: { name, parentId: null, sortOrder: 0 },
          select: { id: true, name: true },
        });
        catNameToId.set(created.name, created.id);
        newCategories.push(created.name);
      }
    }
  }

  // Insert questions in chunks to keep transactions reasonably small.
  const CHUNK = 200;
  let committed = 0;
  for (let start = 0; start < validated.length; start += CHUNK) {
    const slice = validated.slice(start, start + CHUNK);
    await prisma.$transaction(
      slice.map(({ data }) =>
        prisma.question.create({
          data: {
            bankId,
            type: data.type,
            content: data.content,
            imageUrl: data.imageUrl ?? null,
            options: serializeOptions(data.options),
            answer: data.answer.toUpperCase(),
            explanation: data.explanation ?? null,
            tags: serializeTags(data.tags),
            source: 'import',
            categories: {
              create: data.categories
                .map((n) => catNameToId.get(n))
                .filter((id): id is string => Boolean(id))
                .map((categoryId) => ({ categoryId })),
            },
          },
        }),
      ),
    );
    committed += slice.length;
  }

  revalidatePath('/admin/questions');
  revalidatePath('/admin/banks');
  revalidatePath('/admin/categories');

  return {
    ok: true,
    committed,
    invalidSkipped: errors.length,
    newCategories,
  };
}
