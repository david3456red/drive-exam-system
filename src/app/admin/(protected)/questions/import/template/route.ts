import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { buildExcelTemplate } from '@/lib/import-parser';

/**
 * GET /admin/questions/import/template
 *
 * Streams a small .xlsx template (header + 3 sample rows) for users to fill in.
 */
export async function GET() {
  const session = await auth();
  if (!hasPermission(session?.user, 'question:import')) {
    return new Response('Forbidden', { status: 403 });
  }
  const buffer = buildExcelTemplate();
  return new Response(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="questions-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
