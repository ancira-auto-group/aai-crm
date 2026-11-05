import { requireUser } from '../../../../lib/auth.js';
import { json, route } from '../../../../lib/http.js';
import { parseRange, usageReport } from '../../../../lib/usage.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/usage?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, report time zone) */
export const GET = route(async (request) => {
  await requireUser(request, { admin: true });
  const range = parseRange(new URL(request.url).searchParams);
  return json(await usageReport(range));
});
