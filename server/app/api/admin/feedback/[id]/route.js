import { requireUser } from '../../../../../lib/auth.js';
import { sql } from '../../../../../lib/db.js';
import { HttpError, intId, json, readJson, route } from '../../../../../lib/http.js';

export const runtime = 'nodejs';

/** PATCH /api/admin/feedback/:id { status: 'new' | 'read' | 'resolved' } (developers only) */
export const PATCH = route(async (request, { params }) => {
  const admin = await requireUser(request, { developer: true });
  const id = intId((await params).id);
  const { status } = await readJson(request);
  if (!['new', 'read', 'resolved'].includes(status)) {
    throw new HttpError(400, 'Invalid status');
  }

  const [item] = await sql`
    UPDATE feedback SET
      status = ${status},
      updated_at = now(),
      resolved_at = CASE WHEN ${status} = 'resolved' THEN now() ELSE NULL END,
      resolved_by = CASE WHEN ${status} = 'resolved' THEN ${admin.id}::int ELSE NULL END
    WHERE id = ${id}
    RETURNING id, status, resolved_at`;
  if (!item) {
    throw new HttpError(404, 'Feedback not found');
  }
  return json({ item });
});
