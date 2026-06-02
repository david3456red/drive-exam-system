import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_QUESTION_IMAGE_BYTES,
  QuestionImageUploadError,
  resolveQuestionImageFromFormData,
  saveQuestionImageFile,
} from '@/lib/question-images';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempPublicRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'drive-question-images-'));
  tempRoots.push(root);
  return root;
}

describe('question image uploads', () => {
  it('saves a valid image under the questions upload directory and returns a public URL', async () => {
    const publicRoot = makeTempPublicRoot();
    const file = new File([new Uint8Array([1, 2, 3])], '交通 标志.png', {
      type: 'image/png',
    });

    const saved = await saveQuestionImageFile(file, {
      publicRoot,
      randomId: () => 'fixed-id',
    });

    expect(saved).toEqual({
      url: '/uploads/questions/fixed-id.png',
      absolutePath: path.join(publicRoot, 'uploads', 'questions', 'fixed-id.png'),
    });
    expect(existsSync(saved.absolutePath)).toBe(true);
    expect(readFileSync(saved.absolutePath)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('rejects SVG files instead of storing executable markup in public uploads', async () => {
    const publicRoot = makeTempPublicRoot();
    const file = new File(['<svg />'], 'sign.svg', { type: 'image/svg+xml' });

    await expect(
      saveQuestionImageFile(file, { publicRoot, randomId: () => 'bad-svg' }),
    ).rejects.toMatchObject({
      code: 'IMAGE_FILE_TYPE_INVALID',
      filename: 'sign.svg',
    } satisfies Partial<QuestionImageUploadError>);
  });

  it('rejects images larger than the single-file limit', async () => {
    const publicRoot = makeTempPublicRoot();
    const file = new File([new Uint8Array(MAX_QUESTION_IMAGE_BYTES + 1)], 'huge.jpg', {
      type: 'image/jpeg',
    });

    await expect(
      saveQuestionImageFile(file, { publicRoot, randomId: () => 'huge' }),
    ).rejects.toMatchObject({
      code: 'IMAGE_FILE_TOO_LARGE',
      filename: 'huge.jpg',
    } satisfies Partial<QuestionImageUploadError>);
  });

  it('resolves a form upload to the generated public URL', async () => {
    const publicRoot = makeTempPublicRoot();
    const formData = new FormData();
    formData.set(
      'imageFile',
      new File([new Uint8Array([9])], 'warning.webp', { type: 'image/webp' }),
    );

    await expect(
      resolveQuestionImageFromFormData(formData, {
        publicRoot,
        randomId: () => 'form-image',
      }),
    ).resolves.toBe('/uploads/questions/form-image.webp');
  });

  it('rejects forms that provide both an image URL and an upload', async () => {
    const formData = new FormData();
    formData.set('imageUrl', 'https://example.test/sign.png');
    formData.set('imageFile', new File([new Uint8Array([9])], 'warning.png', { type: 'image/png' }));

    await expect(resolveQuestionImageFromFormData(formData)).rejects.toMatchObject({
      code: 'IMAGE_INPUT_CONFLICT',
    });
  });
});
