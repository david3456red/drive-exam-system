import { NextResponse } from 'next/server';

import { generateExcelTemplate } from '@/lib/import/excel-source';
import { requireUser } from '@/lib/server-session';

export async function GET() {
  requireUser('question:import');
  const template = generateExcelTemplate();

  return new NextResponse(new Uint8Array(template), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="question-import-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
