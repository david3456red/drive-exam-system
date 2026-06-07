import {
  MAX_IMPORT_IMAGE_TOTAL_BYTES,
  type ImportImageAttachment,
  type SavedQuestionImage,
  saveQuestionImageAttachment,
  validateQuestionImageAttachment,
} from '@/lib/question-images';

import type { ImportRow, ImportSource, InvalidRow, PreviewResult } from './types';
import { validateRow } from './validate';

export type { ImportImageAttachment } from '@/lib/question-images';

type PrepareImportImageOptions = {
  publicRoot?: string;
  randomId?: () => string;
  maxTotalBytes?: number;
};

export type PreparedImportRowsWithImages = {
  rows: ImportRow[];
  skippedCount: number;
  savedImages: SavedQuestionImage[];
};

type AttachmentIndex = {
  byName: Map<string, ImportImageAttachment>;
  duplicateNames: Set<string>;
  invalidByName: Map<string, string>;
  totalTooLarge: boolean;
};

type ValidatedRowsWithImages = {
  rows: ImportRow[];
  invalid: InvalidRow[];
  attachmentIndex: AttachmentIndex;
};

export function previewImportWithImages(
  source: ImportSource,
  payload: unknown,
  images: ImportImageAttachment[] = [],
): PreviewResult {
  const result = validateRowsWithImageReferences(source, payload, images);
  return { valid: result.rows, invalid: result.invalid };
}

export async function prepareImportRowsWithImages(
  source: ImportSource,
  payload: unknown,
  images: ImportImageAttachment[] = [],
  options: PrepareImportImageOptions = {},
): Promise<PreparedImportRowsWithImages> {
  const result = validateRowsWithImageReferences(source, payload, images, options);
  const savedByName = new Map<string, SavedQuestionImage>();
  const savedImages: SavedQuestionImage[] = [];
  const rows: ImportRow[] = [];

  for (const row of result.rows) {
    const reference = imageAttachmentReference(row.imageUrl);
    if (!reference) {
      rows.push(row);
      continue;
    }

    const key = normalizeAttachmentName(reference);
    let saved = savedByName.get(key);
    if (!saved) {
      const attachment = result.attachmentIndex.byName.get(key);
      if (!attachment) {
        throw new Error(`Missing validated image attachment: ${reference}`);
      }
      saved = await saveQuestionImageAttachment(attachment, options);
      savedByName.set(key, saved);
      savedImages.push(saved);
    }

    rows.push({ ...row, imageUrl: saved.url });
  }

  return {
    rows,
    skippedCount: result.invalid.length,
    savedImages,
  };
}

function validateRowsWithImageReferences(
  source: ImportSource,
  payload: unknown,
  images: ImportImageAttachment[],
  options: PrepareImportImageOptions = {},
): ValidatedRowsWithImages {
  const attachmentIndex = indexAttachments(
    images,
    options.maxTotalBytes ?? MAX_IMPORT_IMAGE_TOTAL_BYTES,
  );
  const rows = source.parse(payload);
  const validRows: ImportRow[] = [];
  const invalid: InvalidRow[] = [];

  rows.forEach((rawRow, index) => {
    const validated = validateRow(rawRow, index);
    if (!validated.ok) {
      invalid.push({ row: validated.row, errors: validated.errors });
      return;
    }

    const imageErrors = errorsForImageReference(validated.data.imageUrl, attachmentIndex);
    if (imageErrors.length > 0) {
      invalid.push({ row: index + 1, errors: imageErrors });
      return;
    }

    validRows.push(validated.data);
  });

  return { rows: validRows, invalid, attachmentIndex };
}

function indexAttachments(images: ImportImageAttachment[], maxTotalBytes: number): AttachmentIndex {
  const byName = new Map<string, ImportImageAttachment>();
  const duplicateNames = new Set<string>();
  const invalidByName = new Map<string, string>();
  let totalBytes = 0;

  for (const image of images) {
    const key = normalizeAttachmentName(image.name);
    totalBytes += image.bytes.length;

    const validationError = validateQuestionImageAttachment(image);
    if (validationError) {
      invalidByName.set(key, `${validationError.code}:${image.name}`);
    }

    if (byName.has(key)) {
      duplicateNames.add(key);
      continue;
    }
    byName.set(key, image);
  }

  return {
    byName,
    duplicateNames,
    invalidByName,
    totalTooLarge: totalBytes > maxTotalBytes,
  };
}

function errorsForImageReference(
  imageUrl: string | undefined,
  attachmentIndex: AttachmentIndex,
): string[] {
  const reference = imageAttachmentReference(imageUrl);
  if (!reference) return [];

  const key = normalizeAttachmentName(reference);
  if (attachmentIndex.totalTooLarge) {
    return [`IMAGE_FILE_TOO_LARGE:${reference}`];
  }
  if (attachmentIndex.duplicateNames.has(key)) {
    return [`IMAGE_FILE_DUPLICATE:${reference}`];
  }
  const invalid = attachmentIndex.invalidByName.get(key);
  if (invalid) return [invalid];
  if (!attachmentIndex.byName.has(key)) {
    return [`IMAGE_FILE_NOT_SELECTED:${reference}`];
  }
  return [];
}

function imageAttachmentReference(imageUrl: string | undefined): string | null {
  const value = imageUrl?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return null;
  if (value.startsWith('/')) return null;
  return value;
}

function normalizeAttachmentName(name: string): string {
  return name.trim().toLocaleLowerCase();
}
