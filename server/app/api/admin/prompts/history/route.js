import { requireUser } from '../../../../../lib/auth.js';
import { sql } from '../../../../../lib/db.js';
import { HttpError, json, route } from '../../../../../lib/http.js';
import { MODES } from '../../../../../lib/prompts.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/prompts/history?mode=enhance|response - saved versions, newest first */
export const GET = route(async (request) => {
  await requireUser(request, { admin: true });
  const mode = new URL(request.url).searchParams.get('mode');
  if (!MODES.includes(mode)) {
    throw new HttpError(400, 'Unknown prompt');
  }
  const versions = await sql`
    SELECT v.id, v.content, v.note, v.created_at, u.email AS created_by
    FROM prompt_versions v LEFT JOIN users u ON u.id = v.created_by
    WHERE v.mode = ${mode}
    ORDER BY v.created_at DESC, v.id DESC
    LIMIT 100`;
  return json({ versions });
});
