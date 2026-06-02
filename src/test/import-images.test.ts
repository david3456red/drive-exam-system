import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  prepareImportRowsWithImages,
  previewImportWithImages,
  type ImportImageAttachment,
} from '@/lib/import/images';
import { jsonSource } from '@/lib/import/json-source';
import { MAX_QUESTION_IMAGE_BYTES } from '@/lib/question-images';

const validRow = {
  type: 'SINGLE',
  content: 'traffic sign question',
  imageUrl: 'stop.png',
  optionA: 'go',
  optionB: 'stop',
  answer: 'B',
  categories: [],
  tags: [],
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempPublicRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'drive-import-images-'));
  tempRoots.push(root);
  return root;
}

function image(name: string, bytes = [7, 8, 9]): ImportImageAttachment {
  return {
    name,
    type: 'image/png',
    size: bytes.length,
    bytes,
  };
}

describe('import image filename matching', () => {
  it('marks rows invalid when imageUrl names a file that was not selected', () => {
    const preview = previewImportWithImages(jsonSource, [validRow], []);

    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid).toEqual([
      {
        row: 1,
        errors: ['IMAGE_FILE_NOT_SELECTED:stop.png'],
      },
    ]);
  });

  it('keeps external URLs and existing absolute upload paths without requiring attachments', () => {
    const preview = previewImportWithImages(jsonSource, [
      { ...validRow, imageUrl: 'https://example.test/stop.png' },
      { ...validRow, content: 'existing upload path', imageUrl: '/uploads/questions/existing.png' },
    ]);

    expect(preview.valid.map((row) => row.imageUrl)).toEqual([
      'https://example.test/stop.png',
      '/uploads/questions/existing.png',
    ]);
    expect(preview.invalid).toHaveLength(0);
  });

  it('saves a matched attachment once and rewrites matching import rows to the generated URL', async () => {
    const publicRoot = makeTempPublicRoot();

    const prepared = await prepareImportRowsWithImages(
      jsonSource,
      [
        validRow,
        { ...validRow, content: 'same sign again' },
      ],
      [image('stop.png')],
      {
        publicRoot,
        randomId: () => 'batch-id',
      },
    );

    expect(prepared.skippedCount).toBe(0);
    expect(prepared.rows.map((row) => row.imageUrl)).toEqual([
      '/uploads/questions/batch-id.png',
      '/uploads/questions/batch-id.png',
    ]);
    expect(prepared.savedImages).toHaveLength(1);
    expect(readFileSync(prepared.savedImages[0]!.absolutePath)).toEqual(Buffer.from([7, 8, 9]));
  });

  it('reports duplicate selected filenames case-insensitively', () => {
    const preview = previewImportWithImages(jsonSource, [validRow], [
      image('stop.png'),
      image('STOP.png'),
    ]);

    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid).toEqual([
      {
        row: 1,
        errors: ['IMAGE_FILE_DUPLICATE:stop.png'],
      },
    ]);
  });

  it('validates the actual attachment byte length instead of trusting the reported size', () => {
    const preview = previewImportWithImages(jsonSource, [validRow], [
      {
        name: 'stop.png',
        type: 'image/png',
        size: 1,
        bytes: Array.from(new Uint8Array(MAX_QUESTION_IMAGE_BYTES + 1)),
      },
    ]);

    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid).toEqual([
      {
        row: 1,
        errors: ['IMAGE_FILE_TOO_LARGE:stop.png'],
      },
    ]);
  });
});
