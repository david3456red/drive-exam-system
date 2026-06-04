import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const QUESTION_IMAGE_URL_PREFIX = '/uploads/questions';
export const MAX_QUESTION_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024;

export type SavedQuestionImage = {
  url: string;
  absolutePath: string;
};

export type ImportImageAttachment = {
  name: string;
  type: string;
  size: number;
  bytes: number[];
};

export type QuestionImageUploadErrorCode =
  | 'IMAGE_FILE_TYPE_INVALID'
  | 'IMAGE_FILE_TOO_LARGE';

export type QuestionImageInputErrorCode = 'IMAGE_INPUT_CONFLICT';

export class QuestionImageUploadError extends Error {
  public readonly code: QuestionImageUploadErrorCode;
  public readonly filename: string;

  constructor(code: QuestionImageUploadErrorCode, filename: string) {
    super(`${code}:${filename}`);
    this.name = 'QuestionImageUploadError';
    this.code = code;
    this.filename = filename;
    Object.setPrototypeOf(this, QuestionImageUploadError.prototype);
  }
}

export class QuestionImageInputError extends Error {
  public readonly code: QuestionImageInputErrorCode;

  constructor(code: QuestionImageInputErrorCode) {
    super(code);
    this.name = 'QuestionImageInputError';
    this.code = code;
    Object.setPrototypeOf(this, QuestionImageInputError.prototype);
  }
}

type SaveQuestionImageOptions = {
  publicRoot?: string;
  randomId?: () => string;
};

type ImageSource = {
  name: string;
  type: string;
  size: number;
};

const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;

export async function saveQuestionImageFile(
  file: File,
  options: SaveQuestionImageOptions = {},
): Promise<SavedQuestionImage> {
  validateQuestionImageSource(file);
  return saveQuestionImageBytes(
    file.name,
    file.type,
    await readFileBytes(file),
    options,
  );
}

export async function saveQuestionImageAttachment(
  attachment: ImportImageAttachment,
  options: SaveQuestionImageOptions = {},
): Promise<SavedQuestionImage> {
  const source = imageSourceFromAttachment(attachment);
  validateQuestionImageSource(source);
  return saveQuestionImageBytes(
    attachment.name,
    attachment.type,
    Uint8Array.from(attachment.bytes),
    options,
  );
}

export async function resolveQuestionImageFromFormData(
  formData: FormData,
  options: SaveQuestionImageOptions = {},
): Promise<string | null> {
  const imageUrl = String(formData.get('imageUrl') ?? '').trim();
  const imageFile = readUploadedFile(formData.get('imageFile'));

  if (imageUrl && imageFile) {
    throw new QuestionImageInputError('IMAGE_INPUT_CONFLICT');
  }

  if (imageFile) {
    const saved = await saveQuestionImageFile(imageFile, options);
    return saved.url;
  }

  return imageUrl.length > 0 ? imageUrl : null;
}

export async function resolveQuestionImageUpdateFromFormData(
  formData: FormData,
  currentImageUrl: string | null,
  options: SaveQuestionImageOptions = {},
): Promise<string | null> {
  if (formData.has('removeImage')) {
    return null;
  }

  const imageUrl = String(formData.get('imageUrl') ?? '').trim();
  const imageFile = readUploadedFile(formData.get('imageFile'));

  if (imageUrl && imageFile) {
    throw new QuestionImageInputError('IMAGE_INPUT_CONFLICT');
  }

  if (imageFile) {
    const saved = await saveQuestionImageFile(imageFile, options);
    return saved.url;
  }

  return imageUrl.length > 0 ? imageUrl : currentImageUrl;
}

export function validateQuestionImageAttachment(
  attachment: ImportImageAttachment,
): QuestionImageUploadError | null {
  try {
    validateQuestionImageSource(imageSourceFromAttachment(attachment));
    return null;
  } catch (error) {
    if (error instanceof QuestionImageUploadError) return error;
    throw error;
  }
}

function validateQuestionImageSource(source: ImageSource): void {
  if (!isAllowedImageMime(source.type)) {
    throw new QuestionImageUploadError('IMAGE_FILE_TYPE_INVALID', source.name);
  }
  if (source.size > MAX_QUESTION_IMAGE_BYTES) {
    throw new QuestionImageUploadError('IMAGE_FILE_TOO_LARGE', source.name);
  }
}

function imageSourceFromAttachment(attachment: ImportImageAttachment): ImageSource {
  return {
    name: attachment.name,
    type: attachment.type,
    size: attachment.bytes.length,
  };
}

async function saveQuestionImageBytes(
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
  options: SaveQuestionImageOptions,
): Promise<SavedQuestionImage> {
  const extension = extensionForMime(mimeType);
  if (!extension) {
    throw new QuestionImageUploadError('IMAGE_FILE_TYPE_INVALID', filename);
  }

  const publicRoot = path.resolve(options.publicRoot ?? path.join(process.cwd(), 'public'));
  const uploadDir = path.resolve(publicRoot, 'uploads', 'questions');
  const safeName = `${options.randomId?.() ?? randomUUID()}.${extension}`;
  const absolutePath = path.resolve(uploadDir, safeName);
  const uploadDirWithSeparator = uploadDir.endsWith(path.sep) ? uploadDir : `${uploadDir}${path.sep}`;

  if (!absolutePath.startsWith(uploadDirWithSeparator)) {
    throw new Error('Resolved image path escaped upload directory');
  }

  await mkdir(uploadDir, { recursive: true });
  await writeFile(absolutePath, bytes);

  return {
    url: `${QUESTION_IMAGE_URL_PREFIX}/${safeName}`,
    absolutePath,
  };
}

function isAllowedImageMime(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXTENSION, mimeType);
}

function extensionForMime(mimeType: string): string | null {
  return MIME_TO_EXTENSION[mimeType as keyof typeof MIME_TO_EXTENSION] ?? null;
}

function readUploadedFile(value: FormDataEntryValue | null): File | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<File>;
  if (typeof candidate.name !== 'string' || typeof candidate.size !== 'number') {
    return null;
  }
  if (candidate.name.trim().length === 0 || candidate.size === 0) {
    return null;
  }
  return value as File;
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('Unexpected image file read result'));
        return;
      }
      resolve(new Uint8Array(result));
    };
    reader.readAsArrayBuffer(file);
  });
}
